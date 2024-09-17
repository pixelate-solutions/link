import { Hono } from "hono";
import { db } from "@/db/drizzle";
import { accounts, transactions, categories, userTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import plaidClient from "./plaid";
import { createId } from "@paralleldrive/cuid2";
import { Transaction } from "plaid";
import { getAuth } from "@hono/clerk-auth";

const app = new Hono();

app.post('/', async (ctx) => {
  const body = await ctx.req.json();
  const auth = getAuth(ctx);
  const userId = auth?.userId || "";

  const { webhook_type, webhook_code, item_id } = body;

  if (webhook_type === "TRANSACTIONS" && webhook_code === "DEFAULT_UPDATE") {
    // Fetch the access token for the item
    const [userToken] = await db
      .select({ accessToken: userTokens.accessToken })
      .from(userTokens)
      .where(eq(userTokens.itemId, item_id));

    const accessToken = userToken?.accessToken;

    if (!accessToken) {
      return ctx.json({ error: "Access token not found" }, 404);
    }

    // Fetch the latest transactions for the item
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

    // Sync the transactions in your database
    await syncTransactions(plaidTransactions, item_id, userId);
  }

  return ctx.json({ success: true });
});

const syncTransactions = async (plaidTransactions: Transaction[], itemId: string, userId: string) => {
  // Fetch userId and account details from your database
  const dbAccounts = await db
    .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId, userId: accounts.userId })
    .from(accounts)
    .where(eq(accounts.plaidAccountId, itemId));

  const accountIdMap = dbAccounts.reduce((map, account) => {
    if (account.plaidAccountId) {
      map[account.plaidAccountId] = account.id;
    }
    return map;
  }, {} as Record<string, string>);

  // Insert new transactions into the database
  const transactionInsertions = plaidTransactions.map(async (transaction) => {
    const accountId = accountIdMap[transaction.account_id];
    if (!accountId) return;

    await db.insert(transactions).values({
      id: createId(),
      accountId,
      userId,
      date: new Date(transaction.date),
      amount: transaction.amount.toString(),
      categoryId: transaction.personal_finance_category?.detailed,
      payee: transaction.merchant_name || transaction.name,
      notes: transaction.pending ? "Pending" : null,
    });
  });

  await Promise.all(transactionInsertions);
};

export default app;
