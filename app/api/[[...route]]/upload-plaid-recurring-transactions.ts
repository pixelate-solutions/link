import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import { accounts, recurringTransactions, userTokens, categories, categorizationRules } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import plaidClient from "./plaid";
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

// Fetch the AI URL from environment variables
const AI_URL = process.env.NEXT_PUBLIC_AI_URL;

const app = new Hono();

const MAX_RETRIES = 6;
const RETRY_DELAY_MS = 2000; // 10 seconds

const TRANSFER_DETAILED_CATEGORIES = new Set([
  "TRANSFER_IN_DEPOSIT",
  "TRANSFER_IN_CASH_ADVANCES_AND_LOANS",
  "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS",
  "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS",
  "TRANSFER_OUT_WITHDRAWAL",
]);

/**
 * Helper to sanitize a transaction (or merchant) name by removing numbers.
 * This ensures that names like "Check Paid #20143" and "Check Paid #19243" are treated as equivalent.
 */
function sanitizeTransactionName(name: string): string {
  return name.replace(/\d+/g, '').trim().toLowerCase();
}

/**
 * Format a Plaid primary category string (e.g. "FOOD_AND_DRINK") into a more user-friendly version.
 */
function formatPlaidCategoryName(category: string): string {
  const splitted = category.split("_");
  const processed = splitted.map((word) => {
    if (word.toUpperCase() === "AND") {
      return "/";
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
  return processed.join(" ").replace(/\s+\/\s+/g, "/");
}

async function fetchRecurringTransactionsWithRetry(accessToken: string) {
  let attempts = 0;
  while (attempts < MAX_RETRIES) {
    try {
      const response = await plaidClient.transactionsRecurringGet({
        access_token: accessToken,
      });
      return response.data; // Return data if successful
    } catch (error) {
      if (attempts >= MAX_RETRIES - 1) {
        throw new Error(
          "Failed to fetch recurring transactions after multiple attempts."
        );
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      attempts++;
    }
  }
  return null; // Return null if all retries failed
}

app.post("/", clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  // Fetch the user's most recent Plaid access token
  const result = await db
    .select({ accessToken: userTokens.accessToken })
    .from(userTokens)
    .where(eq(userTokens.userId, userId))
    .orderBy(desc(userTokens.createdAt));

  const accessToken = result[0]?.accessToken;
  if (!accessToken) {
    return ctx.json({ error: "Access token not found" }, 404);
  }

  try {
    const plaidData = await fetchRecurringTransactionsWithRetry(accessToken);
    if (!plaidData) {
      return ctx.json(
        { error: "Failed to fetch recurring transactions after retries" },
        500
      );
    }

    const inflowStreams = plaidData.inflow_streams || [];
    const outflowStreams = plaidData.outflow_streams || [];
    const allStreams = [...inflowStreams, ...outflowStreams];

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
      if (category.name) {
        map[category.name] = category.id;
      }
      return map;
    }, {} as Record<string, string>);

    const insertedRecurringTransactions = await Promise.all(
      allStreams.map(async (stream) => {
        const accountId = accountIdMap[stream.account_id];
        if (!accountId) return null;

        const detailedCat = stream.personal_finance_category?.detailed ?? "";
        const primaryCatRaw = stream.personal_finance_category?.primary ?? "Other";

        let categoryName: string | null;
        if (TRANSFER_DETAILED_CATEGORIES.has(detailedCat)) {
          categoryName = null;
        } else {
          categoryName = formatPlaidCategoryName(primaryCatRaw);
        }

        let categoryId: string | null = null;
        if (categoryName) {
          categoryId = categoryMap[categoryName] || null;
        }

        // Create a categorization rule keyed on the Plaid primary category (if applicable)
        if (!TRANSFER_DETAILED_CATEGORIES.has(detailedCat) && categoryId) {
          const existingRule = await db
            .select()
            .from(categorizationRules)
            .where(
              and(
                eq(categorizationRules.userId, userId),
                eq(categorizationRules.matchType, "plaid_primary_category"),
                eq(categorizationRules.matchValue, primaryCatRaw)
              )
            )
            .orderBy(desc(categorizationRules.priority), desc(categorizationRules.date));

          if (existingRule.length === 0) {
            await db.insert(categorizationRules).values({
              id: createId(),
              userId,
              categoryId,
              matchType: "plaid_primary_category",
              matchValue: primaryCatRaw,
              priority: 1,
              date: new Date(),
            });
          }
        }

        // --- New logic for transaction name rule begins here ---
        // Format the payee from the stream; this is the same value inserted into the DB below.
        const formattedPayee = stream.merchant_name
          ?.split(" ")
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ") || "Unknown";

        // Sanitize the payee (remove numbers) to determine if a rule already exists.
        const sanitizedPayee = sanitizeTransactionName(formattedPayee);
        const existingNameRule = await db
          .select()
          .from(categorizationRules)
          .where(
            and(
              eq(categorizationRules.userId, userId),
              eq(categorizationRules.matchType, "transaction_name"),
              eq(categorizationRules.matchValue, sanitizedPayee)
            )
          )
          .orderBy(desc(categorizationRules.priority), desc(categorizationRules.date));

        if (existingNameRule.length > 0) {
          // Override the category with the one from the existing rule.
          categoryId = existingNameRule[0].categoryId;
        } else if (categoryId) {
          // Insert a new rule for this transaction name with priority 1.
          await db.insert(categorizationRules).values({
            id: createId(),
            userId,
            categoryId,
            matchType: "transaction_name",
            matchValue: sanitizedPayee,
            priority: 1,
            date: new Date(),
          });
        }
        // --- End new logic for transaction name rule ---

        const avgAmt = stream.average_amount?.amount ?? 0;
        const lastAmt = stream.last_amount?.amount ?? 0;
        const averageAmount = (avgAmt * -1).toString();
        const lastAmount = (lastAmt * -1).toString();

        const existing = await db
          .select({ id: recurringTransactions.id })
          .from(recurringTransactions)
          .where(
            and(
              eq(recurringTransactions.streamId, stream.stream_id),
              eq(recurringTransactions.userId, userId)
            )
          );

        if (existing.length > 0) {
          return null;
        }

        return db.insert(recurringTransactions).values({
          id: createId(),
          userId,
          name: stream.description,
          accountId,
          payee: formattedPayee,
          categoryId,
          frequency: stream.frequency
            .split("_")
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(" "),
          averageAmount,
          lastAmount,
          date: new Date(stream.last_date),
          isActive: stream.is_active.toString(),
          streamId: stream.stream_id,
        }).returning();
      })
    );

    const validTransactions = insertedRecurringTransactions.filter(Boolean);
    return ctx.json({ recurringTransactions: validTransactions });
  } catch (err) {
    console.error("Error fetching recurring transactions from Plaid:", err);
    return ctx.json({ error: "Failed to fetch recurring transactions from Plaid" }, 500);
  }
})
.get('/get', clerkMiddleware(), async (ctx) => {
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
        accountId: recurringTransactions.accountId,
        accountName: accounts.name, // Select the account name
        categoryId: recurringTransactions.categoryId,
        categoryName: categories.name, // Join with categories table to get category name
        frequency: recurringTransactions.frequency,
        averageAmount: recurringTransactions.averageAmount,
        lastAmount: recurringTransactions.lastAmount,
        date: recurringTransactions.date, // Fetch the date field
        isActive: recurringTransactions.isActive,
      })
      .from(recurringTransactions)
      .innerJoin(accounts, eq(recurringTransactions.accountId, accounts.id))
      .leftJoin(categories, eq(recurringTransactions.categoryId, categories.id)) // Join with categories
      .where(eq(recurringTransactions.userId, userId));

    return ctx.json({ recurringTransactions: recurringTransactionsData });
  } catch (error) {
    console.error('Error fetching recurring transactions:', error);
    return ctx.json({ error: 'Failed to fetch recurring transactions' }, 500);
  }
})
.patch(
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
      categoryId: z.string().optional(), // Update categoryId instead of categoryName
      frequency: z.string().optional(),
      averageAmount: z.string().optional(),
      lastAmount: z.string().optional(),
      isActive: z.string().optional(),
      date: z.coerce.date().optional(),  // Ensure date is coerced into a Date object
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
)
.delete('/:id', clerkMiddleware(), async (ctx) => {
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
})
.get(
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
          categoryId: recurringTransactions.categoryId,
          categoryName: categories.name,
          frequency: recurringTransactions.frequency,
          averageAmount: recurringTransactions.averageAmount,
          lastAmount: recurringTransactions.lastAmount,
          date: recurringTransactions.date,  // Include the date field
          isActive: recurringTransactions.isActive,
        })
        .from(recurringTransactions)
        .innerJoin(accounts, eq(recurringTransactions.accountId, accounts.id))
        .leftJoin(categories, eq(recurringTransactions.categoryId, categories.id))
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
)
.post('/bulk-delete', clerkMiddleware(), zValidator(
  "json",
  z.object({
    ids: z.array(z.string()), // Array of transaction IDs to delete
  })
), async (ctx) => {
  const auth = getAuth(ctx);
  const { ids } = ctx.req.valid("json");

  if (!auth?.userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  try {
    await db
      .delete(recurringTransactions)
      .where(
        and(
          eq(recurringTransactions.userId, auth.userId),
          inArray(recurringTransactions.id, ids)
        )
      );

    return ctx.json({ success: true, message: "Recurring transactions deleted successfully" });
  } catch (error) {
    console.error("Error deleting recurring transactions:", error);
    return ctx.json({ error: "Failed to delete recurring transactions" }, 500);
  }
})
.post('/new', clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  const { accountId, name, payee, categoryId, frequency, averageAmount, lastAmount } = await ctx.req.json();

  try {
    // Ensure averageAmount and lastAmount are defined and convert them to strings
    const avgAmountString = averageAmount !== undefined ? averageAmount.toString() : "0";
    const lastAmountString = lastAmount !== undefined ? lastAmount.toString() : "0";

    // Insert new recurring transaction into the database
    const newRecurringTransaction = await db.insert(recurringTransactions).values({
      id: createId(),
      userId: userId,
      accountId: accountId,
      name: name,
      payee: payee || "Unknown",
      categoryId: categoryId,
      frequency: frequency,
      averageAmount: avgAmountString,
      lastAmount: lastAmountString,
      date: new Date(),  // Add the current date
      isActive: "true",  // Set active by default
      streamId: createId(),
    }).returning();

    return ctx.json({ success: true, recurringTransaction: newRecurringTransaction });
  } catch (error) {
    console.error("Error adding new recurring transaction:", error);
    return ctx.json({ error: "Failed to add recurring transaction" }, 500);
  }
});

export default app;
