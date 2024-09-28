import { Hono } from "hono";
import { db } from "@/db/drizzle";
import { accounts, transactions, userTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import plaidClient from "./plaid";
import { createId } from "@paralleldrive/cuid2";
import { Transaction } from "plaid";
import { getAuth } from "@hono/clerk-auth";

// Fetch the AI URL from environment variables
const AI_URL = process.env.NEXT_PUBLIC_AI_URL;

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
  const insertedTransactions = await Promise.all(
    plaidTransactions.map(async (transaction) => {
      const accountId = accountIdMap[transaction.account_id];
      if (!accountId) return null;

      return db.insert(transactions).values({
        id: createId(),
        accountId,
        userId,
        date: new Date(transaction.date),
        amount: transaction.amount.toString(),
        categoryId: transaction.personal_finance_category?.detailed,
        payee: transaction.merchant_name || transaction.name,
        notes: transaction.pending ? "Pending" : null,
      }).returning();
    })
  );

  // Filter null values from inserted transactions
  const validTransactions = insertedTransactions.filter(Boolean);

  // Upsert transactions to AI API
  if (validTransactions.length > 0) {
    const formattedTransactions = validTransactions.map((transaction: any) => {
      return `
        A transaction was made in the amount of $${transaction.amount} by the user to the person or group named ${transaction.payee} on ${transaction.date.toLocaleDateString()}. 
        ${transaction.notes ? `Some notes regarding this transaction to ${transaction.payee} on ${transaction.date.toLocaleDateString()} are: ${transaction.notes}.` : "No additional notes were provided for this transaction."}
      `;
    }).join("\n");

    try {
      // Pass the account ID in the `account` query parameter
      const accountId = accountIdMap[plaidTransactions[0].account_id];
      const aiResponse = await fetch(
        `${AI_URL}/resource/upsert_text?user_id=${userId}&name=Transactions from ${accountId} for ${userId}&account=${accountId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: formattedTransactions.trim(),
        }
      );

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        throw new Error(`Upsert failed: ${errorText}`);
      }

      const responseData = await aiResponse.json();
      console.log("AI Response:", responseData);
    } catch (error) {
      console.error('Error upserting transactions to AI:', error);
    }
  }
};

export default app;
