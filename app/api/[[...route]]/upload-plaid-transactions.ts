import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { accounts, transactions, userTokens, categories } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import plaidClient from "./plaid";
import { eq } from "drizzle-orm";

// Fetch the AI URL from environment variables
const AI_URL = process.env.NEXT_PUBLIC_AI_URL;

const app = new Hono();

app.post('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  // Fetch the user's access token from the database
  const result = await db
    .select({ accessToken: userTokens.accessToken })
    .from(userTokens)
    .where(eq(userTokens.userId, userId));

  const accessToken = result[result.length - 1]?.accessToken;

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
      map[account.plaidAccountId] = account.id; // Map Plaid account ID to database account ID
    }
    return map;
  }, {} as Record<string, string>);

  // Fetch all categories for the user
  const dbCategories = await db
    .select({ id: categories.id, plaidCategoryId: categories.plaidCategoryId })
    .from(categories)
    .where(eq(categories.userId, userId));

  // Create a map of Plaid category IDs to database category IDs
  const categoryIdMap = dbCategories.reduce((map, category) => {
    if (category.plaidCategoryId) {
      map[category.plaidCategoryId] = category.id; // Map Plaid category ID to database category ID
    }
    return map;
  }, {} as Record<string, string>);

  // Insert missing categories
  const categoriesToInsert = plaidTransactions.reduce((set, transaction) => {
    const plaidCategoryId = transaction.personal_finance_category?.detailed || transaction.personal_finance_category?.primary || null;
    if (plaidCategoryId && !categoryIdMap[plaidCategoryId]) {
      set.add(plaidCategoryId);
    }
    return set;
  }, new Set<string>());

  function formatCategory(input: string) {
    // Replace underscores with spaces
    let result = input.replace(/_/g, ' ');

    // Capitalize the first letter of each word and lowercase the rest
    result = result
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    return result;
  }

  for (const plaidCategoryId of categoriesToInsert) {
    await db.insert(categories).values({
      id: createId(),
      userId,
      name: formatCategory(plaidCategoryId),
      plaidCategoryId,
      isFromPlaid: true,
    }).returning();
  }

  // Refresh category map after insertion
  const updatedDbCategories = await db
    .select({ id: categories.id, plaidCategoryId: categories.plaidCategoryId })
    .from(categories)
    .where(eq(categories.userId, userId));

  const updatedCategoryIdMap = updatedDbCategories.reduce((map, category) => {
    if (category.plaidCategoryId) {
      map[category.plaidCategoryId] = category.id; // Map Plaid category ID to database category ID
    }
    return map;
  }, {} as Record<string, string>);

  // Insert transactions for accounts that are already in the database
  const insertedTransactions = await Promise.all(
    plaidTransactions.map(async (transaction) => {
      const plaidCategoryId = transaction.personal_finance_category?.detailed || transaction.personal_finance_category?.primary || null;
      const categoryId = plaidCategoryId ? updatedCategoryIdMap[plaidCategoryId] : null;
      const accountId = accountIdMap[transaction.account_id];

      if (!accountId) {
        // Skip transaction if account is not in the database
        return null;
      }

      // Convert amount to string
      const amount = transaction.amount.toString();

      return db.insert(transactions).values({
        id: createId(),
        userId: userId,
        amount: amount,
        payee: transaction.name,
        date: new Date(transaction.date),
        accountId: accountId,
        categoryId: categoryId,
        isFromPlaid: true,
      }).returning();
    })
  );

  // Format transactions for upserting to AI
  const formattedTransactions = insertedTransactions
    .filter(Boolean)
    .map((transaction: any) => {
      return `
        A transaction was made in the amount of $${transaction.amount} by the user to the person or group named ${transaction.payee} on ${new Date(transaction.date).toLocaleDateString()}. 
        ${transaction.notes ? `Some notes regarding this transaction to ${transaction.payee} on ${new Date(transaction.date).toLocaleDateString()} are: ${transaction.notes}.` : "No additional notes were provided for this transaction."}
      `;
    }).join("\n");

  // Upsert all transactions to the AI endpoint
  try {
    const aiResponse = await fetch(
      `${AI_URL}/resource/upsert_text?user_id=${userId}&name=Transactions from ${accountIdMap[plaidTransactions[0].account_id]} for ${userId}&account=${accountIdMap[plaidTransactions[0].account_id]}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: formattedTransactions.trim(), // Ensure it is a properly formatted plain string
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

  return ctx.json({ transactions: insertedTransactions.filter(Boolean) });
});

export default app;
