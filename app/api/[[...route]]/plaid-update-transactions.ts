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

const sendEmail = async (body: string) => {
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

      console.log(`Retrying transaction sync... Attempt ${attempts + 1}`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      attempts++;
    }
  }

  return null;
};

// Type guard to check if the error is an AxiosError
const isAxiosError = (error: unknown): error is AxiosError => {
  return (error as AxiosError).isAxiosError !== undefined;
};

app.post('/transactions', clerkMiddleware(), async (ctx) => {
  console.log("WEBHOOK STARTED");
  const {
    webhook_code,
    webhook_type,
    item_id,
    new_transactions,
    historical_update_complete,
    initial_update_complete,
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

  const userId = userToken.userId;
  const accessToken = userToken.accessToken;
  const initialCursor = userToken.cursor || null;

  await sendEmail(`Transaction webhook triggered for User: ${userId} and Item Id: ${item_id}.`);

  // Check if the webhook code corresponds to a transaction update
  if (webhook_type === "TRANSACTIONS") {
    // Handle different transaction webhook codes
    switch (webhook_code) {
      case "INITIAL_UPDATE":
        // Handle the initial update when new transactions are available
        console.log("Initial update received. Fetching new transactions...");
        if (new_transactions > 0) {
          const plaidTransactions = await fetchPlaidTransactionsWithRetry(accessToken, initialCursor, item_id, userId);
          if (!plaidTransactions) {
            return ctx.json({ error: "Failed to fetch transactions after multiple attempts" }, 500);
          }
          await processTransactions(plaidTransactions, userId, item_id);
        }
        break;

      case "SYNC_UPDATES_AVAILABLE":
        // Handle sync updates available
        console.log("Sync updates available. Processing...");
        if (historical_update_complete) {
          const plaidTransactions = await fetchPlaidTransactionsWithRetry(accessToken, initialCursor, item_id, userId);
          if (!plaidTransactions) {
            return ctx.json({ error: "Failed to fetch transactions after multiple attempts" }, 500);
          }
          await processTransactions(plaidTransactions, userId, item_id);
        }
        break;

      case "HISTORICAL_UPDATE":
        // Handle historical updates
        console.log("Historical update received. Processing...");
        if (new_transactions > 0) {
          const plaidTransactions = await fetchPlaidTransactionsWithRetry(accessToken, initialCursor, item_id, userId);
          if (!plaidTransactions) {
            return ctx.json({ error: "Failed to fetch transactions after multiple attempts" }, 500);
          }
          await processTransactions(plaidTransactions, userId, item_id);
        }
        break;

      case "DEFAULT_UPDATE":
        // Handle default updates (no new transactions, but still a webhook)
        console.log("Default update received. No new transactions.");
        break;

      default:
        console.log(`Unrecognized webhook code: ${webhook_code}`);
        return ctx.json({ message: `Webhook code ${webhook_code} not handled` }, 200);
    }
  } else if (webhook_type === "ITEM") {
    // Handle ITEM webhook type (item updates, like webhook URL changes)
    switch (webhook_code) {
      case "WEBHOOK_UPDATE_ACKNOWLEDGED":
        console.log("Webhook URL updated. Acknowledging change...");
        break;

      default:
        console.log(`Unrecognized ITEM webhook code: ${webhook_code}`);
        return ctx.json({ message: `ITEM Webhook code ${webhook_code} not handled` }, 200);
    }
  } else {
    console.log(`Unrecognized webhook type: ${webhook_type}`);
    return ctx.json({ error: "Unrecognized webhook type" }, 400);
  }

  console.log("WEBHOOK FINISHED");
  return ctx.json({ message: "Webhook processed successfully" });
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
  const categoriesArray = categorizedResults.slice(1, -1).split(','); // Assuming response format is "[cat1,cat2,...]"

  // Upsert only the new transactions
  await Promise.all(plaidTransactions.map(async (transaction, index) => {
    const accountId = accountIdMap[transaction.account_id];
    if (!accountId) return;

    const categoryId = dbCategories.find(category => category.name === categoriesArray[index])?.id
      || dbCategories.find(category => category.name === "Other (Default)")?.id
      || null;

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
            averageAmount: transaction.amount.toString(),
            lastAmount: transaction.amount.toString(),
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
          frequency: "monthly", // Assuming "monthly"; adjust as needed
          averageAmount: transaction.amount.toString(),
          lastAmount: transaction.amount.toString(),
          date: transaction.date,
          isActive: "true",
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
        // Insert new transaction
        await db.insert(transactions).values({
          id: createId(),
          userId: userId,
          amount: transaction.amount.toString(),
          payee: transaction.name,
          date: new Date(transaction.date),
          accountId: accountId,
          categoryId: categoryId,
          isFromPlaid: true,
          plaidTransactionId: transaction.transaction_id,
        }).execute();
      }
    }
  }));

  // Fetch all inserted transactions for the user to format for AI
  const userTransactions = await db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      payee: transactions.payee,
      date: transactions.date,
      accountId: transactions.accountId,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId));

  // Format transactions for upserting to AI
  const formattedTransactions = userTransactions
    .map((transaction) => {
      const amount = transaction.amount ?? "0"; // Default to "0" if undefined
      const payee = transaction.payee ?? "Unknown Payee"; // Default to "Unknown Payee" if undefined
      const date = new Date(transaction.date);
      const formattedDate = date.toLocaleDateString();

      return `
        A transaction was made in the amount of $${amount} by the user to the person or group named ${payee} on ${formattedDate}. 
        No additional notes were provided for this transaction.
      `;
    }).join("\n").trim(); // Remove any leading or trailing whitespace

  // Upsert transactions to AI endpoint
  try {
    if (formattedTransactions) { // Ensure there are formatted transactions
      const aiResponse = await fetch(
        `${AI_URL}/resource/upsert_text?user_id=${userId}&name=Transactions from ${accountIdMap[plaidTransactions[0].account_id] || "Unknown Payee"} for ${userId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: formattedTransactions,
        }
      );

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        throw new Error(`Upsert failed: ${errorText}`);
      }

      const responseData = await aiResponse.json();
    }
  } catch (error) {
    console.error('Error upserting transactions:', error);
    return new Response(JSON.stringify({ error: 'Failed to upsert transactions' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

app.get('/transactions', clerkMiddleware(), async (ctx) => {
  return ctx.json({ message: "Plaid Transactions Webhook" }, 200);
});

export default app;
