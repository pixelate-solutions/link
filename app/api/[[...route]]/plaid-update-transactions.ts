import { Hono } from "hono";
import { db } from "@/db/drizzle";
import { accounts, recurringTransactions, userTokens } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import plaidClient from "./plaid";
import { createId } from "@paralleldrive/cuid2";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";

// Fetch the AI URL from environment variables
const AI_URL = process.env.NEXT_PUBLIC_AI_URL;

const app = new Hono();

console.log("plaid-update-transactions route loaded");

app.post('/', clerkMiddleware(), async (ctx) => {
  const body = await ctx.req.json();
  const auth = getAuth(ctx);
  const userId = auth?.userId || "";

  const { webhook_type, webhook_code, item_id } = body;
  console.log("Success");

  if (webhook_type === "TRANSACTIONS" && webhook_code === "DEFAULT_UPDATE") {
    console.log("Success");
    // Fetch the access token for the item
    const [userToken] = await db
      .select({ accessToken: userTokens.accessToken })
      .from(userTokens)
      .where(eq(userTokens.itemId, item_id))
      .orderBy(desc(userTokens.createdAt));

    const accessToken = userToken?.accessToken;

    if (!accessToken) {
      return ctx.json({ error: "Access token not found" }, 404);
    }

    // Fetch the latest recurring transactions from Plaid
    const plaidRecurringResponse = await plaidClient.transactionsRecurringGet({
      access_token: accessToken,
    });

    const inflowStreams = plaidRecurringResponse.data.inflow_streams;
    const outflowStreams = plaidRecurringResponse.data.outflow_streams;

    const allStreams = [...inflowStreams, ...outflowStreams];

    // Sync the recurring transactions in your database
    await syncRecurringTransactions(allStreams, item_id, userId);
  }

  return ctx.json({ success: true });
});

const syncRecurringTransactions = async (streams: any[], itemId: string, userId: string) => {
  // Fetch userId and account details from your database
  const dbAccounts = await db
    .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  const accountIdMap = dbAccounts.reduce((map, account) => {
    if (account.plaidAccountId) {
      map[account.plaidAccountId] = account.id;
    }
    return map;
  }, {} as Record<string, string>);

  // Insert or update recurring transactions
  const insertedRecurringTransactions = await Promise.all(
    streams.map(async (stream) => {
      const accountId = accountIdMap[stream.account_id];
      if (!accountId) return null;

      // Check if the recurring transaction already exists based on accountId and stream_id (unique to Plaid)
      const existingTransaction = await db
        .select()
        .from(recurringTransactions)
        .where(and(eq(recurringTransactions.accountId, accountId), eq(recurringTransactions.name, stream.description)));

      if (existingTransaction.length > 0) {
        // Skip inserting if the recurring transaction already exists
        return null;
      }

      // Convert amounts to string, using "0" as fallback if undefined
      const averageAmount = stream.average_amount?.amount
        ? stream.average_amount.amount.toString()
        : "0"; // Fallback to "0" if undefined
      const lastAmount = stream.last_amount?.amount
        ? stream.last_amount.amount.toString()
        : "0"; // Fallback to "0" if undefined

      // Insert new recurring transaction (ensure fields match schema)
      return db.insert(recurringTransactions).values({
        id: createId(),
        userId: userId,
        name: stream.description,
        accountId: accountId,
        payee: stream.merchant_name?.split(' ').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ') || "Unknown",
        categoryId: null, // Set this as null or fetch the actual categoryId if needed
        frequency: stream.frequency.split('_').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' '),
        averageAmount: averageAmount,
        lastAmount: lastAmount,
        date: new Date(),  // Add the current date
        isActive: stream.is_active.toString(),
      }).returning();
    })
  );

  // Filter null values from inserted recurring transactions
  const validRecurringTransactions = insertedRecurringTransactions.filter(Boolean);

  // Optionally handle AI-related tasks here if needed
  if (validRecurringTransactions.length > 0) {
    console.log("New recurring transactions added:", validRecurringTransactions);
  }
};

export default app;
