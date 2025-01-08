import { Hono } from "hono";
import { db } from "@/db/drizzle";
import { accounts, transactions, userTokens, categories, recurringTransactions } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import plaidClient from "./plaid";
import { eq, and, desc } from "drizzle-orm";
import { AxiosError } from 'axios';
import { clerkMiddleware } from "@hono/clerk-auth";
import nodemailer from 'nodemailer';

const AI_URL = process.env.NEXT_PUBLIC_AI_URL;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const app = new Hono();

interface PlaidErrorResponse {
  error_code: string;
  error_message: string;
}

export const sendEmail = async (body: string) => {
  try {
    // Parse request body
    const to = "support@budgetwithlink.com";
    const subject = "TRANSACTION WEBHOOK";
    const emailBody = body;

    // Create reusable transporter object using SMTP transport
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, // e.g., smtp.gmail.com
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false, // true for port 465, false for other ports
      auth: {
        user: process.env.SMTP_USER, // SMTP username
        pass: process.env.SMTP_PASSWORD, // SMTP password
      },
    });

    // Set up email data
    const mailOptions = {
      from: process.env.SMTP_USER, // Sender address
      to, // List of recipients
      subject, // Subject line
      text: body, // Plain text body
    };

    // Send email
    await transporter.sendMail(mailOptions);

    // Return success response
    // return ctx.json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    // return ctx.json({ error: 'Internal Server Error' }, 500);
  }
}

const fetchPlaidTransactionsWithRetry = async (
  accessToken: string,
  initialCursor: string | null = null,
  item_id: string,
  userId: string
) => {
  let attempts = 0;
  let cursor: string | null = initialCursor;
  let allTransactions: any[] = [];

  while (attempts < MAX_RETRIES) {
    try {
      let hasMore = true;

      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: accessToken,
          cursor: cursor ?? undefined,
        });

        const { added, modified, removed, next_cursor, has_more } = response.data;

        const newTransactions = added
          .concat(modified)
          .filter(transaction => transaction.transaction_code !== "transfer")
          .filter(transaction => {
            const categoryCheck = (category: string) => category.toLowerCase().includes("transfer");
            const nameCheck = (name: string | undefined) => name?.toLowerCase().includes("check") || name?.toLowerCase().includes("pay");

            const detailedCategory = transaction.personal_finance_category?.detailed ?? "";
            const primaryCategory = transaction.personal_finance_category?.primary ?? "";
            const name = transaction.name ?? "";

            return !(categoryCheck(detailedCategory) || categoryCheck(primaryCategory)) || nameCheck(name);
          });

        allTransactions = [...allTransactions, ...newTransactions];
        cursor = next_cursor;
        hasMore = has_more;
      }

      // Store the updated cursor for future syncs
      await db.update(userTokens)
        .set({ cursor: cursor })  // Assuming `cursor` is a column in `userTokens`
        .where(and(eq(userTokens.userId, userId), eq(userTokens.itemId, item_id)))
        .execute();

      return allTransactions;

    } catch (error: unknown) {
      // Narrowing the error type to AxiosError
      if (isAxiosError(error)) {
        // Log the full error to help with debugging
        console.error('Error syncing transactions:', error);

        // If the error is INVALID_ACCESS_TOKEN, skip this token and continue
        const errorResponse = error.response?.data as PlaidErrorResponse; // Type assertion
        if (errorResponse?.error_code === 'INVALID_ACCESS_TOKEN') {
          await sendEmail(`Invalid access token for userId ${userId} & access token ${accessToken} & Item ID ${item_id}.`);
          console.warn(`Skipping access token for item ${item_id} due to invalid token.`);
          return [];  // Return an empty array or continue with the next token
        }

        // Retry logic if it is a recoverable error
        if (attempts >= MAX_RETRIES - 1) {
          console.error("Max retries reached. Failing sync.");
          throw new Error("Failed to sync transactions after multiple attempts.");
        }
      } else {
        // If it's not an Axios error, log and throw
        console.error('Unknown error:', error);
        throw new Error('An unknown error occurred.');
      }

      // console.log(`Retrying transaction sync... Attempt ${attempts + 1}`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      attempts++;
    }
  }

  return null;
};

async function fetchRecurringTransactionsWithRetry(accessToken: string) {
  let attempts = 0;
  while (attempts < MAX_RETRIES) {
    try {
      const response = await plaidClient.transactionsRecurringGet({ access_token: accessToken });
      return response.data; // Return data if successful
    } catch (error) {
      if (attempts >= MAX_RETRIES - 1) {
        throw new Error("Failed to fetch recurring transactions after multiple attempts.");
      }
      // console.log(`Retrying recurring transaction fetch... Attempt ${attempts + 1}`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS)); // Wait before retrying
      attempts++;
    }
  }
  return null; // Return null if all retries failed
}

// async function updateTransactions(transactionsList: any[], userId: string, item_id: string) {
//   for (const transaction of transactionsList) {
//     const { id, amount, date, payee, categoryId } = transaction;

//     // Update transaction in the database
//     await db
//       .update(transactions)
//       .set({ amount, date, payee, categoryId })
//       .where(and(eq(transactions.userId, userId), eq(transactions.id, id)));
//   }
//   // console.log(`Updated ${transactionsList.length} transactions for userId ${userId}.`);
// }

// Type guard to check if the error is an AxiosError
const isAxiosError = (error: unknown): error is AxiosError => {
  return (error as AxiosError).isAxiosError !== undefined;
};

app.post('/transactions', clerkMiddleware(), async (ctx) => {
  // console.log("WEBHOOK STARTED");
  const {
    webhook_code,
    webhook_type,
    item_id,
    removed_transactions,
  } = await ctx.req.json();

  // Check if the required field item_id is missing
  if (!item_id) {
    return ctx.json({ error: "Missing item_id" }, 400);
  }

  // Fetch user token and access information
  const userTokensResult = await db
    .select({ userId: userTokens.userId, accessToken: userTokens.accessToken, cursor: userTokens.cursor })
    .from(userTokens)
    .where(eq(userTokens.itemId, item_id))
    .orderBy(desc(userTokens.createdAt));

  const userToken = userTokensResult[0];
  if (!userToken) {
    return ctx.json({ error: "Access token not found" }, 404);
  }

  const { userId, accessToken, cursor: initialCursor } = userToken;

  await sendEmail(`Webhook trigger successful for userId ${userId} & access token ${accessToken}.\n\n Webhook Code: ${webhook_code}\n\n Webhook Type: ${webhook_type}`);

  // Check if the webhook code corresponds to a transaction update
  if (webhook_type === "TRANSACTIONS") {
    // Handle different transaction webhook codes
    switch (webhook_code) {
      case "SYNC_UPDATES_AVAILABLE":
      case "RECURRING_TRANSACTIONS_UPDATE":
        // Fetch non-recurring transactions
        const plaidTransactions = await fetchPlaidTransactionsWithRetry(accessToken, initialCursor, item_id, userId);
        if (!plaidTransactions) {
          await sendEmail("Failed to fetch transactions after multiple attempts.");
          return ctx.json({ error: "Failed to fetch transactions after multiple attempts" }, 500);
        }
        await sendEmail(`Transaction fetch successfull. Gathered ${plaidTransactions.length} transactions.`);
        await processTransactions(plaidTransactions, userId, item_id);

        // Fetch recurring transactions
        const plaidRecurringTransactions = await fetchRecurringTransactionsWithRetry(accessToken);
        if (!plaidRecurringTransactions) {
          return ctx.json({ error: "Failed to fetch recurring transactions after multiple attempts" }, 500);
        }
        await processRecurringTransactions(plaidRecurringTransactions, userId);

        break;

      case "TRANSACTIONS_REMOVED":
        // console.log("Handling TRANSACTIONS_REMOVED webhook...");

        if (removed_transactions && removed_transactions.length > 0) {
            try {
                for (const removedTransactionId of removed_transactions) {
                    // Delete transaction where plaid_transaction_id matches the removed transaction ID
                    await db.delete(transactions)
                        .where(
                            and(
                                eq(transactions.userId, userId),
                                eq(transactions.plaidTransactionId, removedTransactionId)
                            )
                        )
                      .execute();
                }

              // console.log(`Successfully removed ${removed_transactions.length} transactions.`);
              await sendEmail(`Successfully removed ${removed_transactions.length} transactions.`)
            } catch (error) {
                console.error("Error processing removed transactions:", error);
                return ctx.json({ error: "Failed to process removed transactions" }, 500);
            }
        } else {
            // console.log("No transactions to remove.");
        }
        break;
      case "INITIAL_UPDATE":
      case "HISTORICAL_UPDATE":
      case "DEFAULT_UPDATE":
        break;

      default:
        await sendEmail(`Unrecognized webhook code: ${webhook_code}`);
        // console.log(`Unrecognized webhook code: ${webhook_code}`);
        return ctx.json({ message: `Webhook code ${webhook_code} not handled` }, 200);
    }
  } else if (webhook_type === "ITEM") {
    // Handle ITEM webhook type (item updates, like webhook URL changes)
    switch (webhook_code) {
      case "WEBHOOK_UPDATE_ACKNOWLEDGED":
        // console.log("Webhook URL updated. Acknowledging change...");
        break;

      default:
        await sendEmail(`Unrecognized ITEM webhook code: ${webhook_code}`);
        // console.log(`Unrecognized ITEM webhook code: ${webhook_code}`);
        return ctx.json({ message: `ITEM Webhook code ${webhook_code} not handled` }, 200);
    }
  } else {
    await sendEmail(`Unrecognized webhook type: ${webhook_type}`);
    // console.log(`Unrecognized webhook type: ${webhook_type}`);
    return ctx.json({ error: "Unrecognized webhook type" }, 400);
  }

  return ctx.json({ message: "Webhook processed successfully." });

});


// Function to process and insert transactions into the database
async function processTransactions(plaidTransactions: any[], userId: string, itemId: string) {
  const dbAccounts = await db
    .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  const accountIdMap = dbAccounts.reduce((map, account) => {
    if (account.plaidAccountId) {
      map[account.plaidAccountId] = account.id;
    }
    return map;
  }, {} as Record<string, string>);

  const dbCategories = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.userId, userId));

  const categoryOptions = dbCategories.map(category => category.name);

  // Categorize transactions using AI or predefined categories
  const transactionCategories = plaidTransactions.map(transaction =>
    transaction.personal_finance_category?.detailed || transaction.personal_finance_category?.primary || ""
  );

  const query = `Here is a list of categories from recurring transactions: [${transactionCategories}]
    Categorize each of these into one of the following categories: [${categoryOptions.join(", ")}] and
    respond as a list with brackets "[]" and comma-separated values with NO other text than that list.
    You MUST categorize each of these [${transactionCategories}] as one of these: [${categoryOptions.join(", ")}].
    MAKE SURE the values inside are strings in double quotes so that it is a list of strings.
  `;

  const data = {
    user_id: userId,
    query: query,
    allow_access: false,
    using_user_id: true,
  };

  const aiResponse = await fetch(`${AI_URL}/finance/categorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!aiResponse.ok) {
    throw new Error("AI categorization failed");
  }

  const categorizedResults = await aiResponse.json();

  // Upsert only the new transactions
  await Promise.all(plaidTransactions.map(async (transaction, index) => {
    const accountId = accountIdMap[transaction.account_id];
    if (!accountId) return;

    let categoryId = dbCategories.find(category => category.name === categorizedResults[index])?.id;

    if (!categoryId) {
        categoryId = dbCategories.find(category => category.name === "Other (Default)")?.id;
    }
    
    let amount;
    if (transaction.name.toLowerCase().includes("withdraw")) {
      amount = Math.abs(transaction.amount) * -1; // Ensure negative
    } else if (transaction.name.toLowerCase().includes("deposit")) {
      amount = Math.abs(transaction.amount); // Ensure positive
    } else {
      amount = transaction.amount * -1;
    }

    amount = amount.toString();

    if (transaction.recurring) {
      // Handle recurring transactions
      const recurringTransaction = await db
        .select({ id: recurringTransactions.id })
        .from(recurringTransactions)
        .where(and(
          eq(recurringTransactions.userId, userId),
          eq(recurringTransactions.name, transaction.name),
          eq(recurringTransactions.accountId, accountId)
        ))
        .execute();

      if (recurringTransaction.length > 0) {
        // Update existing recurring transaction
        await db
          .update(recurringTransactions)
          .set({
            averageAmount: amount,
            lastAmount: amount,
            date: transaction.date,
            categoryId,
            isActive: "true" // Assuming "true" for active status
          })
          .where(eq(recurringTransactions.id, recurringTransaction[0].id))
          .execute();
      } else {
        // Insert new recurring transaction
        await db.insert(recurringTransactions).values({
          id: createId(),
          userId,
          name: transaction.name,
          payee: transaction.merchant_name ?? null,
          accountId,
          categoryId,
          frequency: transaction.frequency, // Assuming "monthly"; adjust as needed
          averageAmount: amount,
          lastAmount: amount,
          date: transaction.date,
          isActive: transaction.active,
          streamId: createId() // New stream ID for this transaction
        }).execute();
      }
    } else {
      // Handle standard transactions
      const existingTransaction = await db
        .select()
        .from(transactions)
        .where(and(eq(transactions.plaidTransactionId, transaction.transaction_id), eq(transactions.userId, userId)))
        .limit(1)
        .execute();
            
      if (existingTransaction.length === 0) {
        console.log(`NEW TRANSACTION DETECTED. INSERTING NEW TRANSACTION TO DATABASE.`)
        // Insert new transaction
        await db.insert(transactions).values({
          id: createId(),
          userId: userId,
          amount: amount.toString(),
          payee: transaction.name,
          date: new Date(transaction.date),
          accountId: accountId,
          categoryId: categoryId,
          isFromPlaid: true,
          plaidTransactionId: transaction.transaction_id,
        }).execute();
      } else {
        console.log(`SKIPPING EXISTING TRANSACTION`);
      }
    }
  }));

  // // Fetch all inserted transactions for the user to format for AI
  // const userTransactions = await db
  //   .select({
  //     id: transactions.id,
  //     amount: transactions.amount,
  //     payee: transactions.payee,
  //     date: transactions.date,
  //     accountId: transactions.accountId,
  //     categoryId: transactions.categoryId,
  //   })
  //   .from(transactions)
  //   .where(eq(transactions.userId, userId));

  // // Format transactions for upserting to AI
  // const formattedTransactions = userTransactions
  //   .map((transaction) => {
  //     const amount = transaction.amount ?? "0"; // Default to "0" if undefined
  //     const payee = transaction.payee ?? "Unknown Payee"; // Default to "Unknown Payee" if undefined
  //     const date = new Date(transaction.date);
  //     const formattedDate = date.toLocaleDateString();

  //     return `
  //       A transaction was made in the amount of $${amount} by the user to the person or group named ${payee} on ${formattedDate}. 
  //       No additional notes were provided for this transaction.
  //     `;
  //   }).join("\n").trim(); // Remove any leading or trailing whitespace

  // // Upsert transactions to AI endpoint
  // try {
  //   if (formattedTransactions) { // Ensure there are formatted transactions
  //     const aiResponse = await fetch(
  //       `${AI_URL}/resource/upsert_text?user_id=${userId}&name=Transactions from ${accountIdMap[plaidTransactions[0].account_id] || "Unknown Payee"} for ${userId}`,
  //       {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'text/plain',
  //         },
  //         body: formattedTransactions,
  //       }
  //     );

  //     if (!aiResponse.ok) {
  //       const errorText = await aiResponse.text();
  //       throw new Error(`Upsert failed: ${errorText}`);
  //     }

  //     const responseData = await aiResponse.json();
  //   }
  // } catch (error) {
  //   console.error('Error upserting transactions:', error);
  //   return new Response(JSON.stringify({ error: 'Failed to upsert transactions' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  // }
}

async function processRecurringTransactions(plaidData: any, userId: string) {
  // Fetch user's accounts from the database
  const dbAccounts = await db
    .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  const accountIdMap = dbAccounts.reduce((map, account) => {
    if (account.plaidAccountId) {
      map[account.plaidAccountId] = account.id;
    }
    return map;
  }, {} as Record<string, string>);

  // Fetch all categories for the user
  const dbCategories = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.userId, userId));

  const categoryOptions = dbCategories.map(category => category.name);

  const inflowStreams = plaidData.inflow_streams || [];
  const outflowStreams = plaidData.outflow_streams || [];
  const allStreams = [...inflowStreams, ...outflowStreams];

  await sendEmail(`Recurring transaction fetch successfull. Gathered ${allStreams.length} recurring transaction streams.`);

  // Extract the personal_finance_category for AI categorization
  const transactionCategories = allStreams.map(stream =>
    stream.personal_finance_category?.detailed || stream.personal_finance_category?.primary || ""
  );

  // Construct the query for the AI API
  const query = `
    Here is a list of categories from recurring transactions: [${transactionCategories}]
    Categorize each of these into one of the following categories: [${categoryOptions.join(", ")}] and
    respond as a list with brackets "[]" and comma-separated values with NO other text than that list.
    You MUST categorize each of these [${transactionCategories}] as one of these: [${categoryOptions.join(", ")}].
    MAKE SURE the values inside are strings in double quotes so that it is a list of strings.
  `;

  const data = {
    user_id: userId,
    query: query,
    allow_access: false,
    using_user_id: true,
  };

  const aiResponse = await fetch(`${AI_URL}/finance/categorize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!aiResponse.ok) {
    throw new Error('Failed to categorize recurring transactions');
  }

  function stringToList(input: string): string[] {
    const cleanedInput = input.slice(1, -1).trim();
    return cleanedInput.split(',').map(item => item.trim());
  }

  const aiData = await aiResponse.json();
  const categorizedResults = stringToList(aiData);

  // Insert recurring transactions into the database with categorized results
  await Promise.all(
    allStreams.map(async (stream, index) => {
      const accountId = accountIdMap[stream.account_id];
      if (!accountId) {
        // Skip stream if account is not in the database
        return null;
      }

      // Match AI result with a category in the database
      const categoryId = dbCategories.find(category => category.name === categorizedResults[index])?.id;

      // Convert amounts to string, ensuring amounts are handled appropriately
      const averageAmount = stream.average_amount?.amount
        ? (stream.average_amount.amount * -1).toString()
        : "0";
      const lastAmount = stream.last_amount?.amount
        ? (stream.last_amount.amount * -1).toString()
        : "0";
      
      // Check if a transaction with the same streamId already exists
      const existingTransaction = await db
        .select({ id: recurringTransactions.id })
        .from(recurringTransactions)
        .where(and(eq(recurringTransactions.streamId, stream.stream_id), eq(recurringTransactions.userId, userId)));

      if (existingTransaction.length > 0) {
        console.log(`Skipping duplicate transaction for streamId: ${stream.stream_id}`);
        return;
      }

      await db.insert(recurringTransactions).values({
        id: createId(),
        userId,
        name: stream.description,
        accountId,
        payee: stream.merchant_name?.split(' ').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ') || "Unknown",
        categoryId,
        frequency: stream.frequency.split('_').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' '),
        averageAmount,
        lastAmount,
        date: new Date(stream.last_date),
        isActive: stream.is_active.toString(),
        streamId: stream.stream_id,
      }).returning();
    })
  );
}

app.get('/transactions', clerkMiddleware(), async (ctx) => {
  return ctx.json({ message: "Plaid Transactions Webhook" }, 200);
});

export default app;
