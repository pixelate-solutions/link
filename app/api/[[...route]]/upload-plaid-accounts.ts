import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { eq, and } from "drizzle-orm";
import { accounts, userTokens, transactions } from "@/db/schema";
import plaidClient from "./plaid";
import { createId } from "@paralleldrive/cuid2";

const app = new Hono();

app.post('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  const accessTokens = await db
    .select({ accessToken: userTokens.accessToken })
    .from(userTokens)
    .where(eq(userTokens.userId, userId));

  if (accessTokens.length === 0) {
    return ctx.json({ error: "No access tokens found" }, 404);
  }

  for (const token of accessTokens) {
    const accessToken = token.accessToken;

    const plaidResponse = await plaidClient.accountsGet({ access_token: accessToken });
    const plaidAccounts = plaidResponse.data.accounts;

    for (const account of plaidAccounts) {
      // Skip account if name or ID is blank
      if (!account.name || !account.account_id) {
        console.log(`Skipping account with missing name or ID: ${JSON.stringify(account)}`);
        continue;
      }

      // Fetch Plaid transactions for the current account
      const today = new Date();
      const formattedDate = today.toISOString().split('T')[0];
      const plaidTransactionsResponse = await plaidClient.transactionsGet({
        access_token: accessToken,
        client_id: account.account_id,  // Ensure to filter transactions for the specific account
        start_date: "2015-01-01",
        end_date: formattedDate,
      });
      const plaidTransactions = plaidTransactionsResponse.data.transactions;

      // If the Plaid account has no transactions, skip inserting this account
      if (plaidTransactions.length === 0) {
        console.log(`Skipping account with no transactions: ${account.name}`);
        continue;
      }

      // Check if the account already exists for the user
      const existingAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, userId));

      let isDuplicate = false;

      // Check if the account is a duplicate
      for (const existingAccount of existingAccounts) {
        if (existingAccount.name === account.name) {
          // Fetch existing transactions for this account
          const existingTransactions = await db
            .select()
            .from(transactions)
            .where(eq(transactions.accountId, existingAccount.id));

          // Check if the number of transactions and their details match
          if (existingTransactions.length === plaidTransactions.length) {
            isDuplicate = existingTransactions.every((tx, index) => {
              return parseFloat(tx.amount) === plaidTransactions[index].amount &&
                     tx.date.toDateString() === plaidTransactions[index].date;
            });

            if (isDuplicate) continue; // Stop checking further if a duplicate is found
          }
        }
      }

      if (isDuplicate) {
        console.log(`Duplicate account found: ${account.name}`);
        continue; // Skip inserting if the account is a duplicate
      }

      // Insert the new account if it's not a duplicate
      await db.insert(accounts).values({
        id: createId(),
        userId: userId,
        plaidAccountId: account.account_id,
        name: account.name,
        isFromPlaid: true,
      });
    }
  }

  return ctx.json({ message: "Accounts uploaded successfully" });
});

export default app;
