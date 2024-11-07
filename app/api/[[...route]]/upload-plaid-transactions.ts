import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { accounts, transactions, userTokens, categories } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import plaidClient from "./plaid";
import { desc, eq } from "drizzle-orm";

// Fetch the AI URL from environment variables
const AI_URL = process.env.NEXT_PUBLIC_AI_URL;

const app = new Hono();

const MAX_RETRIES = 6;
const RETRY_DELAY_MS = 10000;

interface PlaidTransaction {
  transaction_id: string;
  amount: number;
  name: string;
  date: string;
  account_id: string;
  personal_finance_category?: {
    detailed?: string;
    primary?: string;
  };
  payee: string;
}

interface Category {
  id: string;
  name: string;
}

// Helper function to split an array into smaller batches
const batchArray = (array: any[], size: number) => {
  const batches: any[][] = [];
  for (let i = 0; i < array.length; i += size) {
    batches.push(array.slice(i, i + size));
  }
  return batches;
};

async function fetchPlaidTransactionsWithRetry(accessToken: string, startDate: string, endDate: string) {
  let attempts = 0;
  while (attempts < MAX_RETRIES) {
    try {
      const response = await plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: startDate,
        end_date: endDate,
      });
      return response.data.transactions; // Return transactions if successful
    } catch (error) {
      if (attempts >= MAX_RETRIES - 1) {
        throw new Error("Failed to fetch transactions after multiple attempts.");
      }
      console.log(`Retrying transaction fetch... Attempt ${attempts + 1}`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS)); // Wait before retrying
      attempts++;
    }
  }
  return null;
}

// 1. Start: Fetch user data and Plaid transactions
app.post('/start', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
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
  startDate.setFullYear(endDate.getFullYear() - 2);

  const formattedEndDate = endDate.toISOString().split('T')[0];
  const formattedStartDate = startDate.toISOString().split('T')[0];

  let plaidTransactions = await fetchPlaidTransactionsWithRetry(accessToken, formattedStartDate, formattedEndDate);

  if (!plaidTransactions) {
    return ctx.json({ error: 'Failed to fetch transactions after retries' }, 500);
  }

  // Fetch all accounts from the database for the user
  const dbAccounts = await db
    .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
    .from(accounts)
    .where(eq(accounts.userId, userId));

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

  const categoryOptions = dbCategories.map(category => category.name);

  return ctx.json({ plaidTransactions, accountIdMap, dbCategories, categoryOptions });
});

app.post('/categorize', clerkMiddleware(), async (ctx) => {
  const { plaidTransactions, accountIdMap, dbCategories, categoryOptions } = await ctx.req.json();

  if (!plaidTransactions || !accountIdMap || !dbCategories || !categoryOptions) {
    return ctx.json({ error: 'Missing required data from the previous step' }, 400);
  }

  // Get the category for each transaction from Plaid
  const transactionCategories = plaidTransactions.map((transaction: PlaidTransaction) =>
    transaction.personal_finance_category?.detailed || transaction.personal_finance_category?.primary || ""
  );

  // Split transactions into batches (e.g., 10 transactions per batch)
  const batchSize = 10; // You can adjust this number depending on the size and processing time of each request
  const batches = batchArray(transactionCategories, batchSize);

  // This will hold the results of all batches
  const allCategorizedResults: string[] = [];

  // Process each batch
  for (const batch of batches) {
    // Construct the query for the current batch
    const query = `
      Here is a list of categories from transactions: [${batch}]
      Categorize each of these into one of the following categories: [${categoryOptions.join(", ")}] and
      respond as a list with brackets "[]" and comma-separated values with NO other text than that list.
      You MUST categorize each of these [${batch}] as one of these: [${categoryOptions.join(", ")}].
      Every value in your list response will be one of these values: [${categoryOptions.join(", ")}]. Again, respond as a list with 
      brackets "[]" and comma-separated values with NO other text than that list. And the only options you can use to make
      the list are values from this list: [${categoryOptions.join(", ")}].
    `;

    const data = {
      query: query,
      allow_access: false,
      using_user_id: true,
    };

    try {
      // Call AI API with the categorized transactions for the current batch
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
      const categorizedResults = aiData.split(',').map((item: string) => item.trim());
      allCategorizedResults.push(...categorizedResults); // Append the results of this batch
    } catch (error) {
      console.error('AI API request failed:', error);
      return ctx.json({ error: 'AI categorization request failed' }, 500);
    }
  }

  // Return the combined results
  return ctx.json({ categorizedResults: allCategorizedResults });
});

// 3. Insert: Insert categorized transactions into the database
app.post('/insert', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;
  const { plaidTransactions, categorizedResults, accountIdMap, dbCategories } = await ctx.req.json();

  if (!plaidTransactions || !categorizedResults || !accountIdMap || !dbCategories) {
    return ctx.json({ error: 'Missing required data from the previous step' }, 400);
  }

  await Promise.all(
    plaidTransactions.map(async (transaction: PlaidTransaction, index: number) => {
      const accountId = accountIdMap[transaction.account_id];

      if (!accountId) {
        return;
      }

      const categoryId = dbCategories.find((category: Category) => category.name === categorizedResults[index])?.id;

      if (!categoryId) {
        return;
      }

      const amount = (transaction.amount * -1).toString();

      await db.insert(transactions).values({
        id: createId(),
        userId: userId || "",
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

  return ctx.json({ message: 'Transactions inserted successfully.' });
});

// 4. Finalize: Finalize by upserting formatted transactions to AI
app.post('/finalize', clerkMiddleware(), async (ctx) => {
  const { userId, accountIdMap, plaidTransactions } = await ctx.req.json();

  if (!userId || !accountIdMap || !plaidTransactions) {
    return ctx.json({ error: 'Missing required data from the previous step' }, 400);
  }

  const formattedTransactions = plaidTransactions
    .map((transaction: PlaidTransaction) => {
      const amount = transaction.amount ?? "0";
      const payee = transaction.payee ?? "Unknown Payee";
      const date = new Date(transaction.date);
      const formattedDate = date.toLocaleDateString();

      return `
        A transaction was made in the amount of $${amount} by the user to the person or group named ${payee} on ${formattedDate}. 
        No additional notes were provided for this transaction.
      `;
    }).join("\n").trim();

  try {
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
    console.log("AI Response:", responseData);
  } catch (error) {
    console.error('Error upserting transactions:', error);
    return ctx.json({ error: 'Failed to upsert transactions' }, 500);
  }

  return ctx.json({ message: 'Finalization successful.' });
});

app.post('/recategorize', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  // Fetch all transactions from the database for the user
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

  if (userTransactions.length === 0) {
    return ctx.json({ message: "No transactions found for recategorization" }, 404);
  }

  // Fetch all categories for the user from the database
  const dbCategories = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.userId, userId));

  const categoryOptions = dbCategories.map(category => category.name);

  // Use the payee name for categorization instead of the existing category
  const payeeNames = userTransactions.map(transaction => transaction.payee || "");

  // Split payee names into batches (e.g., 10 names per batch)
  const batchSize = 10; // You can adjust this batch size as needed
  const batches = batchArray(payeeNames, batchSize);

  // This will hold the final categorized results
  const finalCategorizedResults: Record<string, string> = {};

  // Process each batch
  for (const batch of batches) {
    // Construct the query for the current batch
    const query = `
      Here is a list of names from transactions: [${batch}]
      Categorize each of these into one of the following categories: [${categoryOptions.join(", ")}].
      ONLY if this list of categories is empty, use this list instead to categorize each of these into one
         of the following categories: [Food & Drink, Transportation, Bills & Utilities, Fun, Other].
      Return the result as a JavaScript dictionary (JSON object), where the key is the payee name and the value is the assigned category.
      Use this format:
      {
        "payee_name_1": "Category_1",
        "payee_name_2": "Category_2",
        ...
      }
      EVERY transaction name must have a category assigned. If something cannot fit in a category, assign it as "Other".
      ONLY return the dictionary with NO additional text or explanations.
    `;

    const data = {
      user_id: userId,
      query: query,
      allow_access: false,
      using_user_id: true,
    };

    try {
      // Call AI API to recategorize the current batch of payees
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

      const aiData = await aiResponse.json();
      
      // Convert the AI response string into a JavaScript object (dictionary)
      const categorizedResults: Record<string, string> = JSON.parse(aiData);

      // Merge the current batch's results into the final categorized results
      for (const payee of batch) {
        finalCategorizedResults[payee] = categorizedResults[payee] || "Other";
      }
    } catch (error) {
      console.error('AI API request failed:', error);
      return ctx.json({ error: 'AI categorization request failed' }, 500);
    }
  }

  // Update transactions in the database with the new categories
  const updatedTransactions = await Promise.all(
    userTransactions.map(async (transaction) => {
      const categoryName = finalCategorizedResults[transaction.payee || ""];
      const categoryId = dbCategories.find(category => category.name === categoryName)?.id;

      if (!categoryId) {
        // Assign "Other" category if no matching category found
        const otherCategoryId = dbCategories.find(category => category.name === "Other")?.id;
        if (!otherCategoryId) return null; // Skip if "Other" category doesn't exist
        return db
          .update(transactions)
          .set({ categoryId: otherCategoryId })
          .where(eq(transactions.id, transaction.id))
          .returning();
      }

      // Update with the found category ID
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