import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { accounts, transactions, userTokens, categories, transactionUpdates } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import plaidClient from "./plaid";
import { eq, and, desc } from "drizzle-orm";
import { isSameDay } from "date-fns";
import nodemailer from 'nodemailer';

const AI_URL = process.env.NEXT_PUBLIC_AI_URL;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const app = new Hono();

const sendEmail = async (body: string) => {
  try {
    // Parse request body
    const to = "support@budgetwithlink.com";
    const subject = "TRANSACTION WEBHOOK";
    const emailBody = body;

    // Create reusable transporter object using SMTP transport
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, // e.g., smtp.gmail.com
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false, // true for port 465, false for other ports
      auth: {
        user: process.env.SMTP_USER, // SMTP username
        pass: process.env.SMTP_PASSWORD, // SMTP password
      },
    });

    // Set up email data
    const mailOptions = {
      from: process.env.SMTP_USER, // Sender address
      to, // List of recipients
      subject, // Subject line
      text: body, // Plain text body
    };

    // Send email
    await transporter.sendMail(mailOptions);

    // Return success response
    // return ctx.json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    // return ctx.json({ error: 'Internal Server Error' }, 500);
  }
}

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

const fetchPlaidTransactionsWithRetry = async (accessToken: string, initialCursor: string | null = null, item_id: string, userId: string) => {
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

      // Store the updated cursor for future syncs
      await db.update(userTokens)
        .set({ cursor: cursor })  // Assuming `cursor` is a column in `userTokens`
        .where(and(eq(userTokens.userId, userId), eq(userTokens.itemId, item_id)))
        .execute();

      return allTransactions;

    } catch (error) {
      if (attempts >= MAX_RETRIES - 1) {
        throw new Error("Failed to sync transactions after multiple attempts.");
      }
      console.log(`Retrying transaction sync... Attempt ${attempts + 1}`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      attempts++;
    }
  }
  return null;
};

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
  const categoryOptions = dbCategories.map(category => category.name);

  const transactionCategories = plaidTransactions.map(transaction => 
    transaction.personal_finance_category?.detailed || transaction.personal_finance_category?.primary || ""
  );

  await sendEmail(`Transaction webhook about to query for User: ${userId} and Item Id: ${item_id}.`);

  const query = `Here is a list of categories from recurring transactions: [${transactionCategories}]
      Categorize each of these into one of the following categories: [${categoryOptions.join(", ")}] and
      respond as a list with brackets "[]" and comma-separated values with NO other text than that list.
      You MUST categorize each of these [${transactionCategories}] as one of these: [${categoryOptions.join(", ")}].
  `;

  const data = {
    user_id: userId,
    query: query,
    allow_access: false,
    using_user_id: true,
  };

  const aiResponse = await fetch(`${AI_URL}/finance/categorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!aiResponse.ok) {
    return ctx.json({ error: "AI categorization failed" }, 500);
  }

  const categorizedResults = await aiResponse.json();
  const categoriesArray = categorizedResults.slice(1, -1).split(','); // Assuming response format is "[cat1,cat2,...]"

  await Promise.all(plaidTransactions.map(async (transaction, index) => {
    const accountId = accountIdMap[transaction.account_id];
    if (!accountId) return;
    const categoryId = dbCategories.find(category => category.name === categorizedResults[index])?.id || dbCategories.find(category => category.name === "Other (Default)")?.id || null;


    if (accountId) {
      await db.insert(transactions).values({
        id: createId(),
        userId: userId,
        amount: transaction.amount.toString(),
        payee: transaction.name,
        date: new Date(transaction.date),
        accountId: accountId,
        categoryId: categoryId,
        isFromPlaid: true,
        plaidTransactionId: transaction.transaction_id,
      }).execute();
    }
  }));

  await sendEmail(`Transaction webhook finished for User: ${userId} and Item Id: ${item_id}.`);

  return ctx.json({ message: "Transactions synced and inserted" });
});

export default app;
