import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import {
  accounts,
  transactions,
  userTokens,
  categories,
  categorizationRules
} from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import plaidClient from "./plaid";
import { desc, eq, and } from "drizzle-orm";
import { AxiosError } from "axios";

const app = new Hono();

const MAX_RETRIES = 6;
const RETRY_DELAY_MS = 2000;

// Transfer-related `detailed` categories that should map to "Other"
const TRANSFER_DETAILED_CATEGORIES = new Set([
  "TRANSFER_IN_DEPOSIT",
  "TRANSFER_IN_CASH_ADVANCES_AND_LOANS",
  "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS",
  "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS",
  "TRANSFER_OUT_WITHDRAWAL",
]);

interface PlaidErrorResponse {
  error_code: string;
  error_message: string;
}

// Type guard to check if the error is an AxiosError
const isAxiosError = (error: unknown): error is AxiosError => {
  return (error as AxiosError).isAxiosError !== undefined;
};

const fetchPlaidTransactionsWithRetry = async (
  accessToken: string,
  initialCursor: string | null = null,
  itemId: string,
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

        // Exclude certain transfers unless the transaction name suggests it should remain
        const newTransactions = added
          .concat(modified)
          .filter((t) => t.transaction_code !== "transfer")
          .filter((t) => {
            const detailedCategory = t.personal_finance_category?.detailed ?? "";
            const primaryCategory = t.personal_finance_category?.primary ?? "";
            const name = (t.name ?? "").toLowerCase();

            // We do not want normal transfers, unless it's a check/pay
            const categoryCheck = (cat: string) => cat.toLowerCase().includes("transfer");
            const nameCheck = (nm: string) => nm.includes("check") || nm.includes("pay");

            return (
              !(categoryCheck(detailedCategory) || categoryCheck(primaryCategory)) ||
              nameCheck(name)
            );
          });

        allTransactions.push(...newTransactions);

        cursor = next_cursor;
        hasMore = has_more;
      }

      // Store the updated cursor for future syncs
      await db
        .update(userTokens)
        .set({ cursor: cursor })
        .where(and(eq(userTokens.userId, userId), eq(userTokens.itemId, itemId)))
        .execute();

      return allTransactions;
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        console.error("Error syncing transactions:", error);

        // If the error is INVALID_ACCESS_TOKEN, skip this token
        const errData = error.response?.data as PlaidErrorResponse;
        if (errData?.error_code === "INVALID_ACCESS_TOKEN") {
          console.warn(
            `Skipping access token for item ${itemId} due to invalid token.`
          );
          return [];
        }

        // Retry on other errors
        if (attempts >= MAX_RETRIES - 1) {
          console.error("Max retries reached. Failing sync.");
          throw new Error(
            "Failed to sync transactions after multiple attempts."
          );
        }
      } else {
        // Unknown error
        console.error("Unknown error:", error);
        throw new Error("An unknown error occurred.");
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      attempts++;
    }
  }

  return null;
};

/**
 * Format a Plaid primary category string (e.g. "FOOD_AND_DRINK") into a more user-friendly version:
 * - Splits on underscores
 * - Replaces "AND" with "/"
 * - Capitalizes each segment
 * - Joins them with spaces, then removes spaces around slashes
 *
 * Examples:
 *   "INCOME" => "Income"
 *   "TRANSFER_IN" => "Transfer In"
 *   "FOOD_AND_DRINK" => "Food/Drink"
 */
function formatPlaidCategoryName(category: string): string {
  // Split on underscores
  const splitted = category.split("_");
  // Convert "AND" to "/", otherwise capitalize the word
  const processed = splitted.map((word) => {
    if (word.toUpperCase() === "AND") {
      return "/";
    } else {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
  });
  // Join with spaces
  let joined = processed.join(" ");
  // Remove spaces around slashes
  joined = joined.replace(/\s+\/\s+/g, "/");
  return joined;
}

/**
 * Helper to sanitize a transaction name by removing numbers.
 * This makes names like "check paid #20143" and "check paid #19243" equivalent.
 */
function sanitizeTransactionName(name: string): string {
  return name.replace(/\d+/g, '').trim().toLowerCase();
}

/**
 * Initial endpoint that fetches transactions from Plaid and assigns them
 * a "first pass" category using only Plaid's `personal_finance_category`.
 *
 * Now also creates two types of categorization rules:
 *  1. A rule keyed on the Plaid primary category (if not forced to "Other")
 *  2. A rule keyed on the transaction name (ignoring numbers) so that future transactions
 *     with the same (sanitized) payee name are automatically categorized.
 *
 * (Note: When a user manually changes a transaction’s category, a rule with priority 2 is created
 *  which will then override these automatically created priority 1 rules.)
 */
app.post("/", clerkMiddleware(), async (ctx) => {
  const auth = getAuth(ctx);
  const userId = auth?.userId;

  if (!userId) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  // Get user tokens
  const results = await db
    .select({
      accessToken: userTokens.accessToken,
      cursor: userTokens.cursor,
      itemId: userTokens.itemId,
    })
    .from(userTokens)
    .where(eq(userTokens.userId, userId))
    .orderBy(desc(userTokens.createdAt));

  if (results.length === 0) {
    return ctx.json({ error: "No linked Plaid accounts found." }, 400);
  }

  // For each access token, fetch new transactions
  const plaidTransactionsPromises = results.map(async (row) => {
    const accessToken = row.accessToken;
    const initialCursor = row.cursor || null;
    const itemId = row.itemId || "";
    return fetchPlaidTransactionsWithRetry(
      accessToken,
      initialCursor,
      itemId,
      userId
    );
  });

  const plaidTransactions = (await Promise.all(plaidTransactionsPromises)).flat();

  if (!plaidTransactions || plaidTransactions.length === 0) {
    return ctx.json({ error: "No transactions fetched from Plaid." }, 500);
  }

  // Fetch user accounts from DB
  const dbAccounts = await db
    .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  // Build a map from Plaid's account_id -> DB account id
  const accountIdMap = dbAccounts.reduce((map, account) => {
    if (account.plaidAccountId) {
      map[account.plaidAccountId] = account.id;
    }
    return map;
  }, {} as Record<string, string>);

  // Fetch all categories for the user
  const dbCategories = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.userId, userId));

  // Map category name -> category ID
  const categoryMap = dbCategories.reduce((map, category) => {
    if (category.name) {
      map[category.name] = category.id;
    }
    return map;
  }, {} as Record<string, string>);

  // Insert transactions into the DB with a "first pass" category
  await Promise.all(
    plaidTransactions.map(async (transaction) => {
      // 1. Skip if no matching account
      const accountId = accountIdMap[transaction.account_id];
      if (!accountId) return;

      // 2. Determine the categoryName from Plaid
      let categoryName: string | null;
      const detailedCat = transaction.personal_finance_category?.detailed ?? "";
      const primaryCatRaw = transaction.personal_finance_category?.primary ?? "Other";

      if (TRANSFER_DETAILED_CATEGORIES.has(detailedCat)) {
        // Force it to "Other"
        categoryName = null;
      } else {
        // Format the primary category
        categoryName = formatPlaidCategoryName(primaryCatRaw);
      }

      // 3. Find the category ID based on the formatted name
      let categoryId: string | null = null;
      if (categoryName) {
        categoryId = categoryMap[categoryName] || null;
      }

      // 4. Create (if needed) a categorization rule keyed on the Plaid primary category
      //    (We store the raw "primaryCatRaw" so we match exactly what Plaid sends next time)
      if (!TRANSFER_DETAILED_CATEGORIES.has(detailedCat)) {
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
        if (existingRule.length === 0 && categoryId) {
          await db.insert(categorizationRules).values({
            id: createId(),
            userId,
            categoryId,
            matchType: "plaid_primary_category",
            matchValue: primaryCatRaw, // use raw to match future Plaid data
            priority: 1,
            date: new Date(),
          });
        }
      }

      // 5. New logic: Check for a transaction name rule (ignoring numbers)
      //    If one exists, override the category; if not, create a new rule (if a category exists).
      const sanitizedPayee = sanitizeTransactionName(transaction.name);
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
        // Use the category from the existing transaction name rule
        categoryId = existingNameRule[0].categoryId;
      } else if (categoryId) {
        // Insert a new rule for this transaction name (with priority 1)
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

      // 6. Determine the sign of the amount
      let amount: number;
      const lowerName = transaction.name.toLowerCase();
      if (lowerName.includes("withdraw")) {
        amount = Math.abs(transaction.amount) * -1;
      } else if (lowerName.includes("deposit")) {
        amount = Math.abs(transaction.amount);
      } else {
        amount = transaction.amount * -1;
      }

      // 7. Insert the transaction
      await db
        .insert(transactions)
        .values({
          id: createId(),
          userId,
          amount: amount.toString(),
          payee: transaction.name,
          date: new Date(transaction.date),
          accountId: accountId,
          categoryId,
          isFromPlaid: true,
          plaidTransactionId: transaction.transaction_id,
        })
        .returning();
    })
  );

  return ctx.json({
    message:
      "Transactions inserted successfully with first-pass categories, plus categorization rules.",
  });
});

export default app;
