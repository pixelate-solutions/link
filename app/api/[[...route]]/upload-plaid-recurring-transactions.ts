import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { accounts, recurringTransactions, userTokens } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import plaidClient from "./plaid";
import { eq, and, sql, inArray } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const app = new Hono();

// Insert recurring transactions from Plaid
app.post('/', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  // Fetch the user's Plaid access token from the database
  const tokenResult = await db
    .select({ accessToken: userTokens.accessToken })
    .from(userTokens)
    .where(eq(userTokens.userId, userId));

  const accessToken = tokenResult[tokenResult.length - 1]?.accessToken;

  if (!accessToken) {
    return ctx.json({ error: "Access token not found" }, 404);
  }

  // Fetch recurring transactions from Plaid
  const request = { access_token: accessToken };

  try {
    const response = await plaidClient.transactionsRecurringGet(request);
    const inflowStreams = response.data.inflow_streams;
    const outflowStreams = response.data.outflow_streams;

    // Combine inflow and outflow streams
    const allStreams = [...inflowStreams, ...outflowStreams];

    // Fetch user's accounts from the database
    const dbAccounts = await db
      .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
      .from(accounts)
      .where(eq(accounts.userId, userId));

    // Create a map of Plaid account IDs to database account IDs
    const accountIdMap = dbAccounts.reduce((map, account) => {
      if (account.plaidAccountId) {
        map[account.plaidAccountId] = account.id;
      }
      return map;
    }, {} as Record<string, string>);

    // Insert recurring transactions into the database
    const insertedRecurringTransactions = await Promise.all(
      allStreams.map(async (stream) => {
        const accountId = accountIdMap[stream.account_id];
        if (!accountId) {
          // Skip stream if account is not in the database
          return null;
        }

        // Convert amounts to string, using "0" as fallback if undefined
        const averageAmount = stream.average_amount?.amount
          ? stream.average_amount.amount.toString()
          : "0"; // Fallback to "0" if undefined
        const lastAmount = stream.last_amount?.amount
          ? stream.last_amount.amount.toString()
          : "0"; // Fallback to "0" if undefined

        return db.insert(recurringTransactions).values({
          id: createId(),
          userId: userId,
          name: stream.description,
          accountId: accountId,
          merchantName: stream.merchant_name?.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ') || "Unknown",
          categoryName: stream.personal_finance_category?.detailed?.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ') || "Uncategorized",
          frequency: stream.frequency.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' '),
          averageAmount: averageAmount,
          lastAmount: lastAmount,
          isActive: stream.is_active.toString(),
        }).returning();
      })
    );

    // Filter out null results
    const validTransactions = insertedRecurringTransactions.filter(Boolean);

    return ctx.json({ recurringTransactions: validTransactions });

  } catch (err) {
    console.error("Error fetching recurring transactions from Plaid:", err);
    return ctx.json({ error: "Failed to fetch recurring transactions from Plaid" }, 500);
  }
});

// Fetch recurring transactions for the user
app.get('/get', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Fetch all recurring transactions for the user
    const recurringTransactionsData = await db
      .select({
        id: recurringTransactions.id,
        name: recurringTransactions.name,
        accountName: accounts.name, // Select the account name
        categoryName: recurringTransactions.categoryName,
        frequency: recurringTransactions.frequency,
        averageAmount: recurringTransactions.averageAmount,
        lastAmount: recurringTransactions.lastAmount,
        isActive: recurringTransactions.isActive,
      })
      .from(recurringTransactions)
      .innerJoin(accounts, eq(recurringTransactions.accountId, accounts.id))
      .where(eq(recurringTransactions.userId, userId));

    return ctx.json({ recurringTransactions: recurringTransactionsData });
  } catch (error) {
    console.error('Error fetching recurring transactions:', error);
    return ctx.json({ error: 'Failed to fetch recurring transactions' }, 500);
  }
});

// Update recurring transaction
app.patch(
  "/:id",
  clerkMiddleware(),
  zValidator(
    "param",
    z.object({
      id: z.string().optional(),
    })
  ),
  zValidator(
    "json",
    z.object({
      name: z.string().optional(),
      categoryName: z.string().optional(),
      frequency: z.string().optional(),
      averageAmount: z.string().optional(),
      lastAmount: z.string().optional(),
      isActive: z.string().optional(),
    })
  ),
  async (ctx) => {
    const auth = getAuth(ctx);
    const { id } = ctx.req.valid("param");
    const values = ctx.req.valid("json");

    if (!id) {
      return ctx.json({ error: "Missing id." }, 400);
    }

    if (!auth?.userId) {
      return ctx.json({ error: "Unauthorized." }, 401);
    }

    const transactionsToUpdate = db.$with("recurring_transactions_to_update").as(
      db
        .select({ id: recurringTransactions.id })
        .from(recurringTransactions)
        .innerJoin(accounts, eq(recurringTransactions.accountId, accounts.id))
        .where(and(eq(recurringTransactions.id, id), eq(accounts.userId, auth.userId)))
    );

    const [data] = await db
      .with(transactionsToUpdate)
      .update(recurringTransactions)
      .set(values)
      .where(
        inArray(
          recurringTransactions.id,
          sql`(select id from ${transactionsToUpdate})`
        )
      )
      .returning();

    if (!data) {
      return ctx.json({ error: "Not found." }, 404);
    }

    return ctx.json({ data });
  }
);

// Delete recurring transaction
app.delete('/:id', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;
  const transactionId = ctx.req.param("id");

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  try {
    // Verify that the transaction belongs to the authenticated user
    const transaction = await db
      .select()
      .from(recurringTransactions)
      .where(and(eq(recurringTransactions.id, transactionId), eq(recurringTransactions.userId, userId)))

    if (transaction.length === 0) {
      return ctx.json({ error: "Transaction not found or does not belong to the user" }, 404);
    }

    // Delete the recurring transaction
    await db
      .delete(recurringTransactions)
      .where(and(eq(recurringTransactions.id, transactionId), eq(recurringTransactions.userId, userId)))

    return ctx.json({ success: true, message: "Recurring transaction deleted successfully" });
  } catch (error) {
    console.error("Error deleting recurring transaction:", error);
    return ctx.json({ error: "Failed to delete recurring transaction" }, 500);
  }
});

// Get a single recurring transaction by ID
app.get(
  "/:id",
  zValidator(
    "param",
    z.object({
      id: z.string().optional(),
    })
  ),
  clerkMiddleware(),
  async (ctx) => {
    const auth = getAuth(ctx);
    const { id } = ctx.req.valid("param");

    if (!id) {
      return ctx.json({ error: "Missing id." }, 400);
    }

    if (!auth?.userId) {
      return ctx.json({ error: "Unauthorized." }, 401);
    }

    try {
      // Fetch the recurring transaction by id and make sure it belongs to the authenticated user
      const [data] = await db
        .select({
          id: recurringTransactions.id,
          name: recurringTransactions.name,
          accountId: recurringTransactions.accountId,
          accountName: accounts.name,
          categoryName: recurringTransactions.categoryName,
          frequency: recurringTransactions.frequency,
          averageAmount: recurringTransactions.averageAmount,
          lastAmount: recurringTransactions.lastAmount,
          isActive: recurringTransactions.isActive,
        })
        .from(recurringTransactions)
        .innerJoin(accounts, eq(recurringTransactions.accountId, accounts.id))
        .where(and(eq(recurringTransactions.id, id), eq(accounts.userId, auth.userId)));

      if (!data) {
        return ctx.json({ error: "Not found." }, 404);
      }

      return ctx.json({ data });
    } catch (error) {
      console.error("Error fetching recurring transaction:", error);
      return ctx.json({ error: "Failed to fetch recurring transaction." }, 500);
    }
  }
);

export default app;
