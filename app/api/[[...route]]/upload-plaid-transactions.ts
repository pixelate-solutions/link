import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { accounts, transactions } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import plaidClient from "./plaid";
import { userTokens } from "@/db/schema";
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
    .select({ id: accounts.id, plaidAccountId: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  
  // Create a map of Plaid account IDs to database account IDs
  const accountIdMap = dbAccounts.reduce((map, account) => {
    const plaidAccount = plaidAccounts.find(
      (pAccount) => pAccount.account_id === account.plaidAccountId
    );
    if (plaidAccount) {
      map[plaidAccount.account_id] = account.id; // Map Plaid account ID to database account ID
    }
    return map;
  }, {} as Record<string, string>);

  // Insert each transaction into the transactions table
  const insertedTransactions = await Promise.all(
    plaidTransactions.map(async (transaction) => {
      const accountId = accountIdMap[transaction.account_id]; // Ensure accountId is either a valid string or undefined
      const categoryId = transaction.personal_finance_category?.detailed || transaction.personal_finance_category?.primary || null; // Handle category ID, defaulting to null if undefined

      // Only insert transactions if accountId is valid
      if (!accountId) {
        return { error: `No matching account for Plaid account ID ${transaction.account_id}` };
      }

      return db.insert(transactions).values({
        id: createId(),
        amount: transaction.amount,
        payee: transaction.name,
        date: new Date(transaction.date),
        accountId,
        categoryId,
        isFromPlaid: true,
      }).returning();
    })
  );

  return ctx.json({ transactions: insertedTransactions });
});

export default app;
