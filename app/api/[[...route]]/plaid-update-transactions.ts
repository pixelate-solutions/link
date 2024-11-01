import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { accounts, transactions, userTokens, categories, recurringTransactions, transactionUpdates } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import plaidClient from "./plaid";
import { eq, and, desc } from "drizzle-orm";
import { isSameDay } from "date-fns";

// Fetch the AI URL from environment variables
const AI_URL = process.env.NEXT_PUBLIC_AI_URL;

const app = new Hono();

const checkOrUpdateLastRunDate = async (userId: string) => {
  const today = new Date();

  // Retrieve the last update date for the user
  const [lastUpdate] = await db
    .select({ lastUpdated: transactionUpdates.lastUpdated })
    .from(transactionUpdates)
    .where(eq(transactionUpdates.userId, userId))
    .execute();

  // Check if today’s date matches the last update date
  if (lastUpdate && isSameDay(new Date(lastUpdate.lastUpdated), today)) {
    return false; // Already updated today
  }

  // If not updated today, insert or update with today’s date
  await db
    .insert(transactionUpdates)
    .values({
      id: createId(),
      userId: userId,
      lastUpdated: today
    })
    .onConflictDoUpdate({
      target: transactionUpdates.userId,
      set: { lastUpdated: today },
    })
    .execute();

  return true;
};

app.post('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  const shouldProceed = await checkOrUpdateLastRunDate(userId);
  if (!shouldProceed) {
    return ctx.json({ message: 'Already processed today' });
  }

  // Fetch the user's access token from the database
  const result = await db
    .select({ accessToken: userTokens.accessToken })
    .from(userTokens)
    .where(eq(userTokens.userId, userId))
    .orderBy(desc(userTokens.createdAt));

  const accessToken = result[0]?.accessToken;

  if (!accessToken) {
    return ctx.json({ error: "Access token not found" }, 404);
  }

  // Fetch Plaid transactions
  const startDate = new Date();
  const endDate = new Date();
  startDate.setFullYear(endDate.getFullYear() - 10);

  const formattedEndDate = endDate.toISOString().split('T')[0];
  const formattedStartDate = startDate.toISOString().split('T')[0];

  const plaidTransactionsResponse = await plaidClient.transactionsGet({
    access_token: accessToken,
    start_date: formattedStartDate,
    end_date: formattedEndDate,
  });
  const plaidTransactions = plaidTransactionsResponse.data.transactions;

  // Fetch all accounts from the database for the user
  const dbAccounts = await db
    .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  // Create a map of Plaid account IDs to database account IDs
  const accountIdMap = dbAccounts.reduce((map, account) => {
    if (account.plaidAccountId) {
      map[account.plaidAccountId] = account.id;
    }
    return map;
  }, {} as Record<string, string>);

  // Fetch all categories from the categories table
  const dbCategories = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.userId, userId));

  // Map category names from the categories table
  const categoryOptions = dbCategories.map(category => category.name);

  // Get the category for each transaction from Plaid
  const transactionCategories = plaidTransactions.map(transaction => 
    transaction.personal_finance_category?.detailed || transaction.personal_finance_category?.primary || ""
  );

  // Construct the query for the AI API
  const query = `
    Here is a list of categories from transactions: [${transactionCategories}]
    Categorize each of these into one of the following categories: [${categoryOptions.join(", ")}] and
    respond as a list with brackets "[]" and comma-separated values with NO other text than that list.
    You MUST categorize each of these [${transactionCategories}] as one of these: [${categoryOptions.join(", ")}].
    Every value in your list response will be one of these values: [${categoryOptions.join(", ")}]. Again, respond as a list with 
    brackets "[]" and comma-separated values with NO other text than that list. And the only options you can use to make
    the list are values from this list: [${categoryOptions.join(", ")}]. ONLY if this list of categories is empty, use 
    the list instead to categorize each of these into one of the following categories: 
    [Food & Drink, Transportation, Bills & Utilities, Fun, Other].
  `;

  const data = {
    user_id: userId,
    query: query,
    allow_access: false,
    using_user_id: true,
  };

  // Call AI API with the categorized transactions
  const aiResponse = await fetch(`${AI_URL}/finance/categorize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error('Error from AI API:', errorText);
    return ctx.json({ error: 'Failed to categorize transactions' }, 500);
  }

  function stringToList(input: string): string[] {
    const cleanedInput = input.slice(1, -1).trim();
    return cleanedInput.split(',').map(item => item.trim());
  }

  const aiData = await aiResponse.json();
  const categorizedResults = stringToList(aiData);

  // Insert transactions into the database with categorized results
  await Promise.all(
    plaidTransactions.map(async (transaction, index) => {
      const accountId = accountIdMap[transaction.account_id];
      if (!accountId) {
        return
      }; // Skip if account is not found in the database
      
      const plaidTransactionId = transaction.transaction_id;
      // Check if transaction already exists in the database
      const existingTransaction = await db
        .select({ plaidTransactionId: transactions.plaidTransactionId })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), eq(transactions.plaidTransactionId, plaidTransactionId)));

      if (existingTransaction.length > 0) {
        // Transaction already exists, skip insertion
        return;
      }

      // If transaction does not exist, proceed with insertion
      const amount = transaction.amount.toString();
      const categoryId = dbCategories.find(category => category.name === categorizedResults[index])?.id;
      if (!categoryId) {
        return
      }; // Skip if category not found

      await db.insert(transactions).values({
        id: createId(),
        userId: userId,
        amount: amount,
        payee: transaction.name,
        date: new Date(transaction.date),
        accountId: accountId,
        categoryId: categoryId,
        isFromPlaid: true,
        plaidTransactionId: transaction.transaction_id,
      }).returning();
    })
  );

  // Fetch only the newly inserted transactions for the user to format for AI
const newTransactions = await db
  .select({
    id: transactions.id,
    amount: transactions.amount,
    payee: transactions.payee,
    date: transactions.date,
    accountId: transactions.accountId,
    categoryId: transactions.categoryId,
  })
  .from(transactions)
  .where(and(eq(transactions.userId, userId), eq(transactions.isFromPlaid, true))) // Ensure only new transactions from Plaid
  .orderBy(desc(transactions.date)); // Order by date to get the latest

// Prepare to store formatted transactions that need to be upserted
const transactionsToUpsert: string[] = [];

// Check for existing transactions in the database to avoid duplicates
for (const transaction of newTransactions) {
  const existingTransaction = await db
    .select()
    .from(transactions)
    .where(and(
      eq(transactions.userId, userId),
      eq(transactions.amount, transaction.amount),
      eq(transactions.date, transaction.date),
      eq(transactions.accountId, transaction.accountId),
    ))
    .limit(1) // Only need to check for one existing transaction
    .execute(); // Execute the query

  // If no existing transaction found, format the new transaction for upsert
  if (existingTransaction.length === 0) {
    const amount = transaction.amount ?? "0"; // Default to "0" if undefined
    const payee = transaction.payee ?? "Unknown Payee"; // Default to "Unknown Payee" if undefined
    const date = new Date(transaction.date);
    const formattedDate = date.toLocaleDateString();

    transactionsToUpsert.push(`
      A transaction was made in the amount of $${amount} by the user to the person or group named ${payee} on ${formattedDate}. 
      No additional notes were provided for this transaction.
    `);
  }
}

// Join formatted transactions into a single string for upsert
const formattedTransactions = transactionsToUpsert.join("\n").trim(); // Remove any leading or trailing whitespace

// Upsert only the new transactions to the AI endpoint
try {
  if (formattedTransactions) { // Ensure there are formatted transactions
    const aiResponse = await fetch(
      `${AI_URL}/resource/upsert_text?user_id=${userId}&name=Transactions from ${accountIdMap[plaidTransactions[0].account_id]} for ${userId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: formattedTransactions, // Ensure it is a properly formatted plain string
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`Upsert failed: ${errorText}`);
    }

    const responseData = await aiResponse.json();
    console.log("AI Response:", responseData);
  }
} catch (error) {
  console.error("Failed to upsert transactions to AI:", error);
}


  // Fetch recurring transactions from Plaid
  const request = { access_token: accessToken };

  try {
    const response = await plaidClient.transactionsRecurringGet(request);
    const inflowStreams = response.data.inflow_streams;
    const outflowStreams = response.data.outflow_streams;

    // Combine inflow and outflow streams
    const allStreams = [...inflowStreams, ...outflowStreams];

    // Fetch user's accounts from the database
    const dbAccounts = await db
      .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
      .from(accounts)
      .where(eq(accounts.userId, userId));

    // Create a map of Plaid account IDs to database account IDs
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

    // Extract the personal_finance_category for AI categorization
    const transactionCategories = allStreams.map(stream =>
      stream.personal_finance_category?.detailed || stream.personal_finance_category?.primary || ""
    );

    // Construct the query for the AI API
    const query = `
      Here is a list of categories from recurring transactions: [${transactionCategories}]
      Categorize each of these into one of the following categories: [${categoryOptions.join(", ")}] and
      respond as a list with brackets "[]" and comma-separated values with NO other text than that list.
      ONLY if this list of categories is empty, use this list instead to categorize each of these into one
       of the following categories: [Food & Drink, Transportation, Bills & Utilities, Fun, Other].
      You MUST categorize each of these [${transactionCategories}] as one of these: [${categoryOptions.join(", ")}].
    `;

    const data = {
      user_id: userId,
      query: query,
      allow_access: false,
      using_user_id: true,
    };

    // Call AI API with the categorized transactions
    const aiResponse = await fetch(`${AI_URL}/finance/categorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Error from AI API:', errorText);
      return ctx.json({ error: 'Failed to categorize recurring transactions' }, 500);
    }

    function stringToList(input: string): string[] {
      const cleanedInput = input.slice(1, -1).trim();
      return cleanedInput.split(',').map(item => item.trim());
    }

    const aiData = await aiResponse.json();
    const categorizedResults = stringToList(aiData);

    // Insert recurring transactions into the database with categorized results
    const insertedRecurringTransactions = await Promise.all(
      allStreams.map(async (stream, index) => {
        const accountId = accountIdMap[stream.account_id];
        if (!accountId) {
          // Skip stream if account is not in the database
          return null;
        }

        // Match AI result with a category in the database
        const categoryId = dbCategories.find(category => category.name === categorizedResults[index])?.id;

        if (!categoryId) {
          // Skip stream if the AI categorization doesn't match any known category
          return null;
        }

        const existingTransaction = await db
            .select()
            .from(recurringTransactions)
            .where(and(
                eq(recurringTransactions.streamId, stream.stream_id),
                eq(recurringTransactions.userId, userId)
            ));

        if (existingTransaction.length > 0) {
            // If it exists, update the date to new Date(stream.last_date)
            await db.update(recurringTransactions)
                .set({ date: new Date(stream.last_date) }) // Adjust the date field name as necessary
                .where(eq(recurringTransactions.id, existingTransaction[0].id)); // Assuming you want to update the first matching transaction

            return null; // Return null after the update
        }

        // Convert amounts to string, using "0" as fallback if undefined
        const averageAmount = stream.average_amount?.amount
          ? stream.average_amount.amount.toString()
          : "0";
        const lastAmount = stream.last_amount?.amount
          ? stream.last_amount.amount.toString()
          : "0";

        return db.insert(recurringTransactions).values({
          id: createId(),
          userId: userId,
          name: stream.description,
          accountId: accountId,
          payee: stream.merchant_name?.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ') || "Unknown",
          categoryId,
          frequency: stream.frequency.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' '),
          averageAmount: averageAmount,
          lastAmount: lastAmount,
          date: new Date(stream.last_date),
          isActive: stream.is_active.toString(),
          streamId: stream.stream_id,
        }).returning();
      })
    );

      // Check for duplicate recurring transactions and delete the oldest one
      const existingRecurringTransactions = await db
        .select({ id: recurringTransactions.id, createdAt: recurringTransactions.date, streamId: recurringTransactions.streamId })
        .from(recurringTransactions)
        .where(eq(recurringTransactions.userId, userId))
        .orderBy(desc(recurringTransactions.date)); // Order by createdAt descending to get the oldest

      // Initialize a Set to keep track of stream IDs
      const streamIds = new Set();

      // Iterate over the existing recurring transactions
      for (const transaction of existingRecurringTransactions) {
          const { streamId } = transaction; // Destructure streamId from transaction

          if (streamIds.has(streamId)) {
              // More than one transaction with the same streamId, delete the oldest
              // Assuming you have a method to get the grouped transactions
              const oldestTransaction = existingRecurringTransactions.find(t => t.streamId === streamId);

              // Delete the oldest transaction from the database
              await db.delete(recurringTransactions)
                  .where(eq(recurringTransactions.id, oldestTransaction?.id || ""));
          } else {
              // Add the streamId to the Set
              streamIds.add(streamId);
          }
      }

    // Filter out null results
    const validTransactions = insertedRecurringTransactions.filter(Boolean);

    return ctx.json({ recurringTransactions: validTransactions });

  } catch (err) {
    console.error("Error fetching recurring transactions from Plaid:", err);
    return ctx.json({ error: "Failed to fetch recurring transactions from Plaid" }, 500);
  }

  return ctx.json({ success: "Transactions processed successfully" });
});

export default app;
