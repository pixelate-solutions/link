import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { accounts, transactions, userTokens, categories } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import plaidClient from "./plaid";
import { eq } from "drizzle-orm";

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

  const accessToken = result[0]?.accessToken;

  if (!accessToken) {
    return ctx.json({ error: "Access token not found" }, 404);
  }

  // Fetch Plaid accounts and transactions
  const plaidAccountsResponse = await plaidClient.accountsGet({
    access_token: accessToken,
  });
  const plaidAccounts = plaidAccountsResponse.data.accounts;

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

  // Fetch all database accounts for the user
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

  // Determine which Plaid accounts are missing in the database
  const accountsToInsert = plaidAccounts.filter(pAccount => !accountIdMap[pAccount.account_id]);

  // Insert missing accounts
  for (const plaidAccount of accountsToInsert) {
    await db.insert(accounts).values({
      id: createId(),
      userId,
      plaidAccountId: plaidAccount.account_id,
      name: plaidAccount.name,
      isFromPlaid: true,
    }).returning();
  }

  // Refresh account map after insertion
  const updatedDbAccounts = await db
    .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  const updatedAccountIdMap = updatedDbAccounts.reduce((map, account) => {
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
    const plaidCategoryId = transaction.personal_finance_category?.primary || null;
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

  const insertedTransactions = await Promise.all(
    plaidTransactions.map(async (transaction) => {
      const plaidCategoryId = transaction.personal_finance_category?.detailed || transaction.personal_finance_category?.primary || null;
      const categoryId = plaidCategoryId ? updatedCategoryIdMap[plaidCategoryId] : null;
      const accountId = updatedAccountIdMap[transaction.account_id];

      // Convert amount to string
      const amount = transaction.amount

      // Ensure values are of expected types and handle nulls appropriately
      return db.insert(transactions).values({
        id: createId(),
        userId: userId,
        amount: amount.toString(),
        payee: transaction.name,
        date: new Date(transaction.date),
        accountId: accountId, 
        categoryId: categoryId,
        isFromPlaid: true,
      }).returning();
    })
  );


  return ctx.json({ transactions: insertedTransactions });
});

export default app;
