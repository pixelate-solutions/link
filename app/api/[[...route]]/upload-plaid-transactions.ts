import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { accounts, transactions, userTokens, categories } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import plaidClient from "./plaid";
import { desc, eq, and } from "drizzle-orm";
import { AxiosError } from 'axios';

// Fetch the AI URL from environment variables
const AI_URL = process.env.NEXT_PUBLIC_AI_URL;

const app = new Hono();

const MAX_RETRIES = 6;
const RETRY_DELAY_MS = 2000;

interface PlaidErrorResponse {
  error_code: string;
  error_message: string;
}

function stringToList(input: string): string[] {
  // Remove any surrounding quotes and extra characters
  const cleanedInput = input.trim();

  // If the input is wrapped in quotes, remove them
  if (cleanedInput.startsWith('"') && cleanedInput.endsWith('"')) {
    return JSON.parse(cleanedInput);
  }

  // Ensure each list item is a valid string by adding quotes around them
  const validJsonInput = cleanedInput.replace(/([a-zA-Z0-9\s\(\)\/\-]+)(?=\s*,|\s*\])/, '"$1"');

  try {
    // Parse the cleaned string
    return JSON.parse(validJsonInput);
  } catch (error) {
    // console.log("AI RESPONSE: ", cleanedInput);
    throw new Error("Invalid AI response format");
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

      // console.log(`Retrying transaction sync... Attempt ${attempts + 1}`);
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

app.post('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  // Fetch all rows for the given userId
  const results = await db
    .select({ accessToken: userTokens.accessToken, cursor: userTokens.cursor, item_id: userTokens.itemId })
    .from(userTokens)
    .where(eq(userTokens.userId, userId))
    .orderBy(desc(userTokens.createdAt));

  if (results.length === 0) {
    return;
  }

  // Loop through the results and fetch transactions for each one
  const plaidTransactionsPromises = results.map(async (row) => {
    const accessToken = row.accessToken;
    const initialCursor = row.cursor || null;
    const itemId = row.item_id || "";

    // Fetch transactions from Plaid for each row's accessToken, cursor, and itemId
    return fetchPlaidTransactionsWithRetry(accessToken, initialCursor, itemId, userId);
  });

  // Wait for all the fetches to complete
  const plaidTransactions = (await Promise.all(plaidTransactionsPromises)).flat();
  
  // console.log("TRANSACTIONS LENGTH (non-transfer): ", plaidTransactions?.length);

  if (!plaidTransactions) {
    return ctx.json({ error: 'Failed to fetch transactions after retries' }, 500);
  }

  // Fetch all accounts from the database for the user
  const dbAccounts = await db
    .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  // Create a map of Plaid account IDs to database account IDs
  const accountIdMap = dbAccounts.reduce((map, account) => {
    if (account.plaidAccountId) {
      map[account.plaidAccountId] = account.id; // Map Plaid account ID to database account ID
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
    the list are values from this list: [${categoryOptions.join(", ")}]. MAKE SURE the values inside are strings in double quotes so that it is a 
    list of strings.
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

  const aiData = await aiResponse.json();
  const categorizedResults = stringToList(aiData);

  // Insert transactions into the database with categorized results
  await Promise.all(
    plaidTransactions.map(async (transaction, index) => {
      const accountId = accountIdMap[transaction.account_id];

      if (!accountId) {
        // Skip transaction if account is not in the database
        return;
      }

      // Match AI result with a category in the database
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
        amount = transaction.amount * -1; // Default to the original value
      }

      amount = amount.toString();

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

  // Upsert all transactions to the AI endpoint
  try {
    if (formattedTransactions) { // Ensure there are formatted transactions
      const aiResponse = await fetch(
        `${AI_URL}/resource/upsert_text?user_id=${userId}&name=Transactions from ${accountIdMap[plaidTransactions[0].account_id]} for ${userId}`,
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
    return ctx.json({ error: 'Failed to upsert transactions' }, 500);
  }

  return ctx.json({ message: 'Transactions inserted successfully.' });
});

app.post('/recategorize', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  // Fetch all transactions for the user
  const userTransactions = await db
    .select({
      id: transactions.id,
      payee: transactions.payee,
      accountId: transactions.accountId,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId));

  if (userTransactions.length === 0) {
    return ctx.json({ message: "No transactions found for recategorization" }, 404);
  }

  // Fetch all categories for the user
  const dbCategories = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.userId, userId));

  const categoryOptions = dbCategories.map(category => category.name);

  // Transaction payee names for categorization
  const payeeNames = userTransactions.map(transaction => transaction.payee || "");

  // Construct the query for the AI API
  const query = `
    Here is a list of transaction payee names: [${payeeNames.join(", ")}].
    Categorize each of these into one of the following categories: [${categoryOptions.join(", ")}].
    Make sure EVERY one of those transactions is categorized into one of the categories so your
    response list needs to be the same length as the length of the transactions list.
    Return the result as a plain JavaScript array (list) in the same order as the payee names.
    The format should be:
    ["Category_1", "Category_2", ..., "Category_n"]
    Ensure the response contains NO escape characters or additional text, explanations, or formatting.
    MAKE SURE the values inside are strings in double quotes so that it is a list of strings.
    If a transaction does not fit into any category, assign it to "Other (Default)".
  `;

  const data = {
    user_id: userId,
    query: query,
    allow_access: false,
    using_user_id: true,
  };

  // Call AI API to recategorize the transactions
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
    return ctx.json({ error: 'Failed to recategorize transactions' }, 500);
  }

  const aiData = await aiResponse.text();
  const cleanedAiData = JSON.parse(aiData);

  // Ensure the AI API returns a valid list format
  let categorizedResults: string[];
  try {
    categorizedResults = stringToList(cleanedAiData);
  } catch (error) {
    // console.log('Failed to parse AI response:', error);
    return ctx.json({ error: 'Invalid response format from AI API' }, 500);
  }

  // if (!Array.isArray(categorizedResults) || categorizedResults.length !== payeeNames.length) {
  //   return ctx.json({ error: 'AI response does not match expected format or length' }, 500);
  // }

  // Update transactions in the database with new categories
  const updatedTransactions = await Promise.all(
    userTransactions.map(async (transaction, index) => {
      const categoryName = categorizedResults[index] || "Other (Default)";
      let categoryId = dbCategories.find(category => category.name === categoryName)?.id;

      if (!categoryId) {
        categoryId = dbCategories.find(category => category.name === "Other (Default)")?.id;
      }

      // Update with found category ID
      return db
        .update(transactions)
        .set({ categoryId })
        .where(eq(transactions.id, transaction.id))
        .returning();
    })
  );

  return ctx.json({ transactions: updatedTransactions.filter(Boolean) });
});

export default app;