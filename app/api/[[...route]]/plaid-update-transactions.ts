import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { accounts, transactions, userTokens, categories, transactionUpdates } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import plaidClient from "./plaid";
import { eq, and, desc } from "drizzle-orm";
import { isSameDay } from "date-fns";
import nodemailer from 'nodemailer';
import { AxiosError } from 'axios';

const AI_URL = process.env.NEXT_PUBLIC_AI_URL;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const app = new Hono();

// Send email function
const sendEmail = async (body: string) => {
  try {
    const to = "support@budgetwithlink.com";
    const subject = "TRANSACTION WEBHOOK";
    const emailBody = body;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.SMTP_USER,
      to,
      subject,
      text: body,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

// Check or update the last run date to prevent duplicate processing within a day
const checkOrUpdateLastRunDate = async (userId: string) => {
  const today = new Date();
  const [lastUpdate] = await db
    .select({ lastUpdated: transactionUpdates.lastUpdated })
    .from(transactionUpdates)
    .where(eq(transactionUpdates.userId, userId))
    .execute();

  if (lastUpdate && isSameDay(new Date(lastUpdate.lastUpdated), today)) {
    return false;
  }

  await db
    .insert(transactionUpdates)
    .values({
      id: createId(),
      userId: userId,
      lastUpdated: today,
    })
    .onConflictDoUpdate({
      target: transactionUpdates.userId,
      set: { lastUpdated: today },
    })
    .execute();

  return true;
};

// Type for Plaid error response
interface PlaidErrorResponse {
  error_code: string;
  error_message: string;
}

// Function to fetch transactions from Plaid with retry logic
const fetchPlaidTransactionsWithRetry = async (
  accessToken: string,
  initialCursor: string | null = null,
  item_id: string,
  userId: string
) => {
  let attempts = 0;
  let cursor: string | null = initialCursor;
  let allTransactions: any[] = [];

  while (attempts < MAX_RETRIES) {
    try {
      let hasMore = true;

      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: accessToken,
          cursor: cursor ?? undefined,
        });

        const { added, modified, removed, next_cursor, has_more } = response.data;

        const newTransactions = added
          .concat(modified)
          .filter(transaction => transaction.transaction_code !== "transfer")
          .filter(transaction => {
            const categoryCheck = (category: string) => category.toLowerCase().includes("transfer");
            const nameCheck = (name: string | undefined) => name?.toLowerCase().includes("check") || name?.toLowerCase().includes("pay");

            const detailedCategory = transaction.personal_finance_category?.detailed ?? "";
            const primaryCategory = transaction.personal_finance_category?.primary ?? "";
            const name = transaction.name ?? "";

            return !(categoryCheck(detailedCategory) || categoryCheck(primaryCategory)) || nameCheck(name);
          });

        allTransactions = [...allTransactions, ...newTransactions];
        cursor = next_cursor;
        hasMore = has_more;
      }

      await db.update(userTokens)
        .set({ cursor: cursor })
        .where(and(eq(userTokens.userId, userId), eq(userTokens.itemId, item_id)))
        .execute();

      return allTransactions;

    } catch (error: unknown) {
      if (isAxiosError(error)) {
        const errorResponse = error.response?.data as PlaidErrorResponse;
        if (errorResponse?.error_code === 'INVALID_ACCESS_TOKEN') {
          console.warn(`Skipping access token for item ${item_id} due to invalid token.`);
          return [];
        }

        if (attempts >= MAX_RETRIES - 1) {
          console.error("Max retries reached. Failing sync.");
          throw new Error("Failed to sync transactions after multiple attempts.");
        }
      } else {
        console.error('Unknown error:', error);
        throw new Error('An unknown error occurred.');
      }

      console.log(`Retrying transaction sync... Attempt ${attempts + 1}`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      attempts++;
    }
  }

  return null;
};

// Type guard to check if error is an AxiosError
const isAxiosError = (error: unknown): error is AxiosError => {
  return (error as AxiosError).isAxiosError !== undefined;
};

// Webhook endpoint to process the incoming Plaid webhook
app.post('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;
  const { item_id } = await ctx.req.json();

  if (!userId || !item_id) {
    return ctx.json({ error: "Unauthorized or missing item_id" }, 401);
  }

  await sendEmail(`Transaction webhook triggered for User: ${userId} and Item Id: ${item_id}.`);

  const shouldProceed = await checkOrUpdateLastRunDate(userId);
  if (!shouldProceed) {
    return ctx.json({ message: 'Already processed today' });
  }

  const result = await db
    .select({ accessToken: userTokens.accessToken, cursor: userTokens.cursor })
    .from(userTokens)
    .where(and(eq(userTokens.userId, userId), eq(userTokens.itemId, item_id)))
    .orderBy(desc(userTokens.createdAt));

  const accessToken = result[0]?.accessToken;
  const initialCursor = result[0]?.cursor || null;

  if (!accessToken) {
    console.log("NO ACCESS TOKEN");
    return ctx.json({ error: "Access token not found" }, 404);
  }

  await sendEmail(`Transaction webhook about to fetch transactions for User: ${userId} and Item Id: ${item_id}.`);

  const plaidTransactions = await fetchPlaidTransactionsWithRetry(accessToken, initialCursor, item_id, userId);

  await sendEmail(`Transaction webhook successfully fetched transactions for User: ${userId} and Item Id: ${item_id}.`);

  if (!plaidTransactions) {
    return ctx.json({ error: "Failed to fetch transactions after multiple attempts" }, 500);
  }

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

  const dbCategories = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.userId, userId));

  const categoryMap = dbCategories.reduce((map, category) => {
    map[category.name || ""] = category.id;
    return map;
  }, {} as Record<string, string>);

  const transactionsToInsert = plaidTransactions.map(transaction => {
    const accountId = accountIdMap[transaction.account_id] ?? null;
    const categoryId = categoryMap[transaction.category?.[0] ?? ''] ?? null;
    const amount = transaction.amount.toString(); // Ensuring it's a string, as expected by the schema
    const payee = transaction.payee ?? ''; // Defaulting to empty string if no payee
    const notes = transaction.notes ?? ''; // Defaulting to empty string if no notes
    const date = new Date(transaction.date); // Ensuring it's a Date object
    const plaidTransactionId = transaction.transaction_id; // Assuming this field exists in the transaction

    return {
      id: createId(),
      userId,
      accountId,
      categoryId,
      amount,
      payee,
      notes,
      date,
      type: transaction.transaction_type ?? 'UNKNOWN', // Ensure a fallback for undefined types
      isFromPlaid: true, // Assuming this is a Plaid transaction
      plaidTransactionId, // Assuming the transaction ID is unique
    };
  });

  // Inserting into the database
  await db.insert(transactions).values(transactionsToInsert).execute();


  return ctx.json({ message: 'Webhook processed successfully' });
});

export default app;
