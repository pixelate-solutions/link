import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import {
  accounts,
  recurringTransactions,
  userTokens,
  categories,
  categorizationRules,
} from "@/db/schema";
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
  return name.replace(/\d+/g, "").trim().toLowerCase();
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

/**
 * Determine the final categoryId for a transaction (or recurring stream).
 *
 * This function first checks for existing user-defined rules (transaction_name, merchant_name,
 * transaction_description, transaction_type) by gathering all matching rules and returning the
 * one with the highest priority (sorted descending by priority, then by date).
 *
 * If no rule is found, it falls back to the default Plaid primary category and may create new rules.
 *
 * NOTE: For recurring streams the object format is slightly different. In particular, we now
 * use the "description" field if "name" is not provided.
 */
async function determineCategoryIdForTransaction(
  transactionOrStream: any,
  userRules: any[],
  categoryMap: Record<string, string>,
  userId: string
): Promise<string | null> {
  // For recurring streams, use description if name is not provided.
  const rawName = transactionOrStream.name || transactionOrStream.description || transactionOrStream.merchant_name || "";
  const sanitizedName = sanitizeTransactionName(rawName);
  const merchantName = transactionOrStream.merchant_name?.toLowerCase() || "";
  // For the transaction description, prefer description over name.
  const transactionDesc =
    transactionOrStream.description?.toLowerCase() ||
    transactionOrStream.name?.toLowerCase() ||
    "";
  const transactionType = transactionOrStream.transaction_type || "";

  // Helper to get the highest priority rule from an array of matching rules
  function getHighestPriorityRule(rules: any[]): any | null {
    if (rules.length === 0) return null;
    rules.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    return rules[0];
  }

  // Check for transaction_name rules
  const transactionNameRules = userRules.filter(
    (rule) => rule.matchType === "transaction_name" && rule.matchValue === sanitizedName
  );
  const highestTransactionNameRule = getHighestPriorityRule(transactionNameRules);
  if (highestTransactionNameRule) {
    return highestTransactionNameRule.categoryId;
  }

  // Check for merchant_name rules
  const merchantNameRules = userRules.filter(
    (rule) => rule.matchType === "merchant_name" && merchantName.includes(rule.matchValue.toLowerCase())
  );
  const highestMerchantNameRule = getHighestPriorityRule(merchantNameRules);
  if (highestMerchantNameRule) {
    return highestMerchantNameRule.categoryId;
  }

  // Check for transaction_description rules
  const transactionDescriptionRules = userRules.filter(
    (rule) => rule.matchType === "transaction_description" && transactionDesc.includes(rule.matchValue.toLowerCase())
  );
  const highestTransactionDescriptionRule = getHighestPriorityRule(transactionDescriptionRules);
  if (highestTransactionDescriptionRule) {
    return highestTransactionDescriptionRule.categoryId;
  }

  // Check for transaction_type rules
  const transactionTypeRules = userRules.filter(
    (rule) => rule.matchType === "transaction_type" && transactionType === rule.matchValue
  );
  const highestTransactionTypeRule = getHighestPriorityRule(transactionTypeRules);
  if (highestTransactionTypeRule) {
    return highestTransactionTypeRule.categoryId;
  }

  // Force "Other" if personal_finance_category.detailed is in TRANSFER_DETAILED_CATEGORIES
  const detailedCat = transactionOrStream.personal_finance_category?.detailed ?? "";
  if (TRANSFER_DETAILED_CATEGORIES.has(detailedCat)) {
    return null;
  }

  // Otherwise, format the Plaid primary category
  const primaryCatRaw = transactionOrStream.personal_finance_category?.primary ?? null;
  const categoryName = formatPlaidCategoryName(primaryCatRaw) || "";
  let finalCategoryId = categoryMap[categoryName] || null;

  // Create a new rule for "plaid_primary_category" if it doesn't exist and the category isn't "Other"
  if (finalCategoryId && categoryName) {
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
        categoryId: finalCategoryId,
        matchType: "plaid_primary_category",
        matchValue: primaryCatRaw,
        priority: 1,
        date: new Date(),
      });
    }
  }

  // Check for (or create) a transaction_name rule for the sanitized name
  if (finalCategoryId && sanitizedName) {
    const existingNameRule = await db
      .select()
      .from(categorizationRules)
      .where(
        and(
          eq(categorizationRules.userId, userId),
          eq(categorizationRules.matchType, "transaction_name"),
          eq(categorizationRules.matchValue, sanitizedName)
        )
      )
      .orderBy(desc(categorizationRules.priority), desc(categorizationRules.date));

    if (existingNameRule.length > 0) {
      finalCategoryId = existingNameRule[0].categoryId;
    } else {
      await db.insert(categorizationRules).values({
        id: createId(),
        userId,
        categoryId: finalCategoryId,
        matchType: "transaction_name",
        matchValue: sanitizedName.toLowerCase(),
        priority: 1,
        date: new Date(),
      });
    }
  }

  return finalCategoryId;
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
  if (!userId) return ctx.json({ error: "Unauthorized" }, 401);

  // Fetch the user's most recent Plaid access token
  const result = await db
    .select({ accessToken: userTokens.accessToken })
    .from(userTokens)
    .where(eq(userTokens.userId, userId))
    .orderBy(desc(userTokens.createdAt));

  const accessToken = result[0]?.accessToken;
  if (!accessToken) return ctx.json({ error: "Access token not found" }, 404);

  try {
    const plaidData = await fetchRecurringTransactionsWithRetry(accessToken);
    if (!plaidData) {
      return ctx.json({ error: "Failed to fetch recurring transactions after retries" }, 500);
    }

    const inflowStreams = plaidData.inflow_streams || [];
    const outflowStreams = plaidData.outflow_streams || [];
    const allStreams = [...inflowStreams, ...outflowStreams];

    // Build a map from Plaid account_id -> DB account id
    const dbAccounts = await db
      .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
      .from(accounts)
      .where(eq(accounts.userId, userId));
    const accountIdMap = dbAccounts.reduce((map, account) => {
      if (account.plaidAccountId) map[account.plaidAccountId] = account.id;
      return map;
    }, {} as Record<string, string>);

    // Build a map from category name -> category ID
    const dbCategories = await db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.userId, userId));
    const categoryMap = dbCategories.reduce((map, category) => {
      if (category.name) map[category.name] = category.id;
      return map;
    }, {} as Record<string, string>);

    // Pre-fetch all existing categorization rules for the user
    const userRules = await db
      .select()
      .from(categorizationRules)
      .where(eq(categorizationRules.userId, userId));

    const insertedRecurringTransactions = await Promise.all(
      allStreams.map(async (stream) => {
        const accountId = accountIdMap[stream.account_id];
        if (!accountId) return null;

        // Determine the category using the updated helper function
        const categoryId = await determineCategoryIdForTransaction(
          stream,
          userRules,
          categoryMap,
          userId
        );

        // Format the payee from the stream (fallback to "Unknown" if missing)
        const formattedPayee =
          stream.merchant_name
            ?.split(" ")
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(" ") || "Unknown";

        const avgAmt = stream.average_amount?.amount ?? 0;
        const lastAmt = stream.last_amount?.amount ?? 0;
        const averageAmount = (avgAmt * -1).toString();
        const lastAmount = (lastAmt * -1).toString();

        // Check if a recurring transaction for this stream already exists
        const existing = await db
          .select({ id: recurringTransactions.id })
          .from(recurringTransactions)
          .where(
            and(
              eq(recurringTransactions.streamId, stream.stream_id),
              eq(recurringTransactions.userId, userId)
            )
          );
        if (existing.length > 0) return null;

        return db
          .insert(recurringTransactions)
          .values({
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
          })
          .returning();
      })
    );

    const validTransactions = insertedRecurringTransactions.filter(Boolean);
    return ctx.json({ recurringTransactions: validTransactions });
  } catch (err) {
    console.error("Error fetching recurring transactions from Plaid:", err);
    return ctx.json({ error: "Failed to fetch recurring transactions from Plaid" }, 500);
  }
})
.get("/get", clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;
  if (!userId) return ctx.json({ error: "Unauthorized" }, 401);

  try {
    const recurringTransactionsData = await db
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
        date: recurringTransactions.date,
        isActive: recurringTransactions.isActive,
      })
      .from(recurringTransactions)
      .innerJoin(accounts, eq(recurringTransactions.accountId, accounts.id))
      .leftJoin(categories, eq(recurringTransactions.categoryId, categories.id))
      .where(eq(recurringTransactions.userId, userId));

    return ctx.json({ recurringTransactions: recurringTransactionsData });
  } catch (error) {
    console.error("Error fetching recurring transactions:", error);
    return ctx.json({ error: "Failed to fetch recurring transactions" }, 500);
  }
})
.patch(
  "/:id",
  clerkMiddleware(),
  zValidator("param", z.object({ id: z.string().optional() })),
  zValidator(
    "json",
    z.object({
      name: z.string().optional(),
      categoryId: z.string().optional(),
      frequency: z.string().optional(),
      averageAmount: z.string().optional(),
      lastAmount: z.string().optional(),
      isActive: z.string().optional(),
      date: z.coerce.date().optional(),
    })
  ),
  async (ctx) => {
    const auth = getAuth(ctx);
    const { id } = ctx.req.valid("param");
    const values = ctx.req.valid("json");
    if (!id) return ctx.json({ error: "Missing id." }, 400);
    if (!auth?.userId) return ctx.json({ error: "Unauthorized." }, 401);

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
      .where(inArray(recurringTransactions.id, sql`(select id from ${transactionsToUpdate})`))
      .returning();

    if (!data) return ctx.json({ error: "Not found." }, 404);
    return ctx.json({ data });
  }
)
.delete("/:id", clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;
  const transactionId = ctx.req.param("id");
  if (!userId) return ctx.json({ error: "Unauthorized" }, 401);

  try {
    const transaction = await db
      .select()
      .from(recurringTransactions)
      .where(and(eq(recurringTransactions.id, transactionId), eq(recurringTransactions.userId, userId)));

    if (transaction.length === 0) {
      return ctx.json({ error: "Transaction not found or does not belong to the user" }, 404);
    }

    await db
      .delete(recurringTransactions)
      .where(and(eq(recurringTransactions.id, transactionId), eq(recurringTransactions.userId, userId)));

    return ctx.json({ success: true, message: "Recurring transaction deleted successfully" });
  } catch (error) {
    console.error("Error deleting recurring transaction:", error);
    return ctx.json({ error: "Failed to delete recurring transaction" }, 500);
  }
})
.get(
  "/:id",
  zValidator("param", z.object({ id: z.string().optional() })),
  clerkMiddleware(),
  async (ctx) => {
    const auth = getAuth(ctx);
    const { id } = ctx.req.valid("param");
    if (!id) return ctx.json({ error: "Missing id." }, 400);
    if (!auth?.userId) return ctx.json({ error: "Unauthorized." }, 401);

    try {
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
          date: recurringTransactions.date,
          isActive: recurringTransactions.isActive,
        })
        .from(recurringTransactions)
        .innerJoin(accounts, eq(recurringTransactions.accountId, accounts.id))
        .leftJoin(categories, eq(recurringTransactions.categoryId, categories.id))
        .where(and(eq(recurringTransactions.id, id), eq(accounts.userId, auth.userId)));

      if (!data) return ctx.json({ error: "Not found." }, 404);
      return ctx.json({ data });
    } catch (error) {
      console.error("Error fetching recurring transaction:", error);
      return ctx.json({ error: "Failed to fetch recurring transaction." }, 500);
    }
  }
)
.post(
  "/bulk-delete",
  clerkMiddleware(),
  zValidator("json", z.object({ ids: z.array(z.string()) })),
  async (ctx) => {
    const auth = getAuth(ctx);
    const { ids } = ctx.req.valid("json");
    if (!auth?.userId) return ctx.json({ error: "Unauthorized" }, 401);

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
  }
)
.post("/new", clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;
  if (!userId) return ctx.json({ error: "Unauthorized" }, 401);

  const { accountId, name, payee, categoryId, frequency, averageAmount, lastAmount } = await ctx.req.json();
  try {
    const avgAmountString = averageAmount !== undefined ? averageAmount.toString() : "0";
    const lastAmountString = lastAmount !== undefined ? lastAmount.toString() : "0";

    const newRecurringTransaction = await db
      .insert(recurringTransactions)
      .values({
        id: createId(),
        userId: userId,
        accountId: accountId,
        name: name,
        payee: payee || "Unknown",
        categoryId: categoryId,
        frequency: frequency,
        averageAmount: avgAmountString,
        lastAmount: lastAmountString,
        date: new Date(),
        isActive: "true",
        streamId: createId(),
      })
      .returning();

    return ctx.json({ success: true, recurringTransaction: newRecurringTransaction });
  } catch (error) {
    console.error("Error adding new recurring transaction:", error);
    return ctx.json({ error: "Failed to add recurring transaction" }, 500);
  }
});

export default app;
