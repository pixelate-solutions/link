import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { accounts, recurringTransactions, userTokens, categories } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import plaidClient from "./plaid";
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

// Fetch the AI URL from environment variables
const AI_URL = process.env.NEXT_PUBLIC_AI_URL;

const app = new Hono();

const MAX_RETRIES = 6;
const RETRY_DELAY_MS = 10000; // 10 seconds

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
      console.log(`Retrying recurring transaction fetch... Attempt ${attempts + 1}`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS)); // Wait before retrying
      attempts++;
    }
  }
  return null; // Return null if all retries failed
}

// Insert recurring transactions from Plaid
app.post('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  // Fetch the user's Plaid access token from the database
  const result = await db
    .select({ accessToken: userTokens.accessToken })
    .from(userTokens)
    .where(eq(userTokens.userId, userId))
    .orderBy(desc(userTokens.createdAt));

  const accessToken = result[0]?.accessToken;

  if (!accessToken) {
    return ctx.json({ error: "Access token not found" }, 404);
  }

  try {
    // Fetch recurring transactions with retry logic
    const plaidData = await fetchRecurringTransactionsWithRetry(accessToken);

    if (!plaidData) {
      return ctx.json({ error: 'Failed to fetch recurring transactions after retries' }, 500);
    }

    const inflowStreams = plaidData.inflow_streams;
    const outflowStreams = plaidData.outflow_streams;
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

        // Convert amounts to string, using "0" as fallback if undefined
        const averageAmount = stream.average_amount?.amount
          ? (stream.average_amount.amount * -1).toString()
          : "0";
        const lastAmount = stream.last_amount?.amount
          ? (stream.last_amount.amount * -1).toString()
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
          streamId: stream.stream_id
        }).returning();
      })
    );

    // Filter out null results
    const validTransactions = insertedRecurringTransactions.filter(Boolean);

    return ctx.json({ recurringTransactions: validTransactions });

  } catch (err) {
    console.error("Error fetching recurring transactions from Plaid:", err);
    return ctx.json({ error: "Failed to fetch recurring transactions from Plaid" }, 500);
  }
}).get('/get', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Fetch all recurring transactions for the user
    const recurringTransactionsData = await db
      .select({
        id: recurringTransactions.id,
        name: recurringTransactions.name,
        accountId: recurringTransactions.accountId,
        accountName: accounts.name, // Select the account name
        categoryId: recurringTransactions.categoryId,
        categoryName: categories.name, // Join with categories table to get category name
        frequency: recurringTransactions.frequency,
        averageAmount: recurringTransactions.averageAmount,
        lastAmount: recurringTransactions.lastAmount,
        date: recurringTransactions.date, // Fetch the date field
        isActive: recurringTransactions.isActive,
      })
      .from(recurringTransactions)
      .innerJoin(accounts, eq(recurringTransactions.accountId, accounts.id))
      .leftJoin(categories, eq(recurringTransactions.categoryId, categories.id)) // Join with categories
      .where(eq(recurringTransactions.userId, userId));

    return ctx.json({ recurringTransactions: recurringTransactionsData });
  } catch (error) {
    console.error('Error fetching recurring transactions:', error);
    return ctx.json({ error: 'Failed to fetch recurring transactions' }, 500);
  }
}).patch(
  "/:id",
  clerkMiddleware(),
  zValidator(
    "param",
    z.object({
      id: z.string().optional(),
    })
  ),
  zValidator(
    "json",
    z.object({
      name: z.string().optional(),
      categoryId: z.string().optional(), // Update categoryId instead of categoryName
      frequency: z.string().optional(),
      averageAmount: z.string().optional(),
      lastAmount: z.string().optional(),
      isActive: z.string().optional(),
      date: z.coerce.date().optional(),  // Ensure date is coerced into a Date object
    })
  ),
  async (ctx) => {
    const auth = getAuth(ctx);
    const { id } = ctx.req.valid("param");
    const values = ctx.req.valid("json");

    if (!id) {
      return ctx.json({ error: "Missing id." }, 400);
    }

    if (!auth?.userId) {
      return ctx.json({ error: "Unauthorized." }, 401);
    }

    const transactionsToUpdate = db.$with("recurring_transactions_to_update").as(
      db
        .select({ id: recurringTransactions.id })
        .from(recurringTransactions)
        .innerJoin(accounts, eq(recurringTransactions.accountId, accounts.id))
        .where(and(eq(recurringTransactions.id, id), eq(accounts.userId, auth.userId)))
    );

    const [data] = await db
      .with(transactionsToUpdate)
      .update(recurringTransactions)
      .set(values)
      .where(
        inArray(
          recurringTransactions.id,
          sql`(select id from ${transactionsToUpdate})`
        )
      )
      .returning();

    if (!data) {
      return ctx.json({ error: "Not found." }, 404);
    }

    return ctx.json({ data });
  }
).delete('/:id', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;
  const transactionId = ctx.req.param("id");

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Verify that the transaction belongs to the authenticated user
    const transaction = await db
      .select()
      .from(recurringTransactions)
      .where(and(eq(recurringTransactions.id, transactionId), eq(recurringTransactions.userId, userId)))

    if (transaction.length === 0) {
      return ctx.json({ error: "Transaction not found or does not belong to the user" }, 404);
    }

    // Delete the recurring transaction
    await db
      .delete(recurringTransactions)
      .where(and(eq(recurringTransactions.id, transactionId), eq(recurringTransactions.userId, userId)))

    return ctx.json({ success: true, message: "Recurring transaction deleted successfully" });
  } catch (error) {
    console.error("Error deleting recurring transaction:", error);
    return ctx.json({ error: "Failed to delete recurring transaction" }, 500);
  }
}).get(
  "/:id",
  zValidator(
    "param",
    z.object({
      id: z.string().optional(),
    })
  ),
  clerkMiddleware(),
  async (ctx) => {
    const auth = getAuth(ctx);
    const { id } = ctx.req.valid("param");

    if (!id) {
      return ctx.json({ error: "Missing id." }, 400);
    }

    if (!auth?.userId) {
      return ctx.json({ error: "Unauthorized." }, 401);
    }

    try {
      // Fetch the recurring transaction by id and make sure it belongs to the authenticated user
      const [data] = await db
        .select({
          id: recurringTransactions.id,
          name: recurringTransactions.name,
          accountId: recurringTransactions.accountId,
          accountName: accounts.name,
          categoryId: recurringTransactions.categoryId,
          categoryName: categories.name,
          frequency: recurringTransactions.frequency,
          averageAmount: recurringTransactions.averageAmount,
          lastAmount: recurringTransactions.lastAmount,
          date: recurringTransactions.date,  // Include the date field
          isActive: recurringTransactions.isActive,
        })
        .from(recurringTransactions)
        .innerJoin(accounts, eq(recurringTransactions.accountId, accounts.id))
        .leftJoin(categories, eq(recurringTransactions.categoryId, categories.id))
        .where(and(eq(recurringTransactions.id, id), eq(accounts.userId, auth.userId)));

      if (!data) {
        return ctx.json({ error: "Not found." }, 404);
      }

      return ctx.json({ data });
    } catch (error) {
      console.error("Error fetching recurring transaction:", error);
      return ctx.json({ error: "Failed to fetch recurring transaction." }, 500);
    }
  }
).post('/bulk-delete', clerkMiddleware(), zValidator(
  "json",
  z.object({
    ids: z.array(z.string()), // Array of transaction IDs to delete
  })
), async (ctx) => {
  const auth = getAuth(ctx);
  const { ids } = ctx.req.valid("json");

  if (!auth?.userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Perform bulk delete of recurring transactions
    await db
      .delete(recurringTransactions)
      .where(
        and(
          eq(recurringTransactions.userId, auth.userId),
          inArray(recurringTransactions.id, ids)
        )
      );

    return ctx.json({ success: true, message: "Recurring transactions deleted successfully" });
  } catch (error) {
    console.error("Error deleting recurring transactions:", error);
    return ctx.json({ error: "Failed to delete recurring transactions" }, 500);
  }
}).post('/new', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  const { accountId, name, payee, categoryId, frequency, averageAmount, lastAmount } = await ctx.req.json();

  try {
    // Ensure averageAmount and lastAmount are defined and convert them to strings
    const avgAmountString = averageAmount !== undefined ? averageAmount.toString() : "0";
    const lastAmountString = lastAmount !== undefined ? lastAmount.toString() : "0";

    // Insert new recurring transaction into the database
    const newRecurringTransaction = await db.insert(recurringTransactions).values({
      id: createId(),
      userId: userId,
      accountId: accountId,
      name: name,
      payee: payee || "Unknown",
      categoryId: categoryId,
      frequency: frequency,
      averageAmount: avgAmountString,
      lastAmount: lastAmountString,
      date: new Date(),  // Add the current date
      isActive: "true",  // Set active by default
      streamId: createId(),
    }).returning();

    return ctx.json({ success: true, recurringTransaction: newRecurringTransaction });
  } catch (error) {
    console.error("Error adding new recurring transaction:", error);
    return ctx.json({ error: "Failed to add recurring transaction" }, 500);
  }
}).post('/recategorize', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  // Fetch all recurring transactions from the database for the user
  const userRecurringTransactions = await db
    .select({
      id: recurringTransactions.id,
      name: recurringTransactions.name,
      accountId: recurringTransactions.accountId,
      categoryId: recurringTransactions.categoryId,
    })
    .from(recurringTransactions)
    .where(eq(recurringTransactions.userId, userId));

  if (userRecurringTransactions.length === 0) {
    return ctx.json({ message: "No recurring transactions found for recategorization" }, 404);
  }

  // Fetch all categories for the user from the database
  const dbCategories = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.userId, userId));

  const categoryOptions = dbCategories.map(category => category.name);

  // Use the name of the recurring transaction for categorization instead of the existing category
  const recurringTransactionNames = userRecurringTransactions.map(transaction => transaction.name || "");

  // Construct the query for the AI API to recategorize recurring transactions based on the name
  const query = `
    Here is a list of transaction names: [${recurringTransactionNames}]
    Categorize each of these into one of the following categories: [${categoryOptions.join(", ")}].
    ONLY if this list of categories is empty, use this list instead to categorize each of these into one
       of the following categories: [Food & Drink, Transportation, Bills & Utilities, Fun, Other].
    Return the result as a JavaScript dictionary (JSON object), where the key is the transaction name and the value is the assigned category.
    Use this format:
    {
      "transaction_name_1": "Category_1",
      "transaction_name_2": "Category_2",
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

  // Call AI API to recategorize the recurring transactions
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
    return ctx.json({ error: 'Failed to recategorize recurring transactions' }, 500);
  }

  const aiData = await aiResponse.json();
  
  // Convert the AI response string into a JavaScript object (dictionary)
  const categorizedResults: Record<string, string> = JSON.parse(aiData);

  // Ensure every transaction has a category, assign "Other" if missing
  const finalCategorizedResults: Record<string, string> = {};
  recurringTransactionNames.forEach((name) => {
    finalCategorizedResults[name] = categorizedResults[name] || "Other";
  });

  // Update recurring transactions in the database with new categories
  const updatedRecurringTransactions = await Promise.all(
    userRecurringTransactions.map(async (transaction) => {
      const categoryName = finalCategorizedResults[transaction.name];
      const categoryId = dbCategories.find(category => category.name === categoryName)?.id;

      if (!categoryId) {
        // Assign "Other" category if no matching category found
        const otherCategoryId = dbCategories.find(category => category.name === "Other")?.id;
        if (!otherCategoryId) return null; // Skip if "Other" category doesn't exist
        return db
          .update(recurringTransactions)
          .set({ categoryId: otherCategoryId })
          .where(eq(recurringTransactions.id, transaction.id))
          .returning();
      }

      // Update with found category ID
      return db
        .update(recurringTransactions)
        .set({ categoryId })
        .where(eq(recurringTransactions.id, transaction.id))
        .returning();
    })
  );

  return ctx.json({ recurringTransactions: updatedRecurringTransactions.filter(Boolean) });
});

export default app;