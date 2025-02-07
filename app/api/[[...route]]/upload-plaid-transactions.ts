import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { db } from "@/db/drizzle";
import {
  accounts,
  transactions,
  userTokens,
  categories,
  categorizationRules,
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
  return name.replace(/\d+/g, "").trim().toLowerCase();
}

/**
 * Determine the final categoryId for a transaction.
 *
 * The function first checks if any user-defined rules already exist in the DB.
 * If so, it returns the matching categoryId. Otherwise, it falls back to using the
 * default Plaid category and creates new rules for future transactions.
 */
async function determineCategoryIdForTransaction(
  transactionOrStream: any,
  userRules: any[],
  categoryMap: Record<string, string>,
  userId: string
): Promise<string | null> {
  const rawName = transactionOrStream.name || transactionOrStream.merchant_name || "";
  const sanitizedName = sanitizeTransactionName(rawName);
  const merchantName = transactionOrStream.merchant_name?.toLowerCase() || "";
  const transactionDesc =
    transactionOrStream.name?.toLowerCase() ||
    transactionOrStream.description?.toLowerCase() ||
    "";
  const transactionType = transactionOrStream.transaction_type || "";

  // Helper to get the highest priority rule from an array
  function getHighestPriorityRule(rules: any[]): any | null {
    if (rules.length === 0) return null;
    rules.sort((a, b) => {
      // First sort descending by priority, then by date (newer first)
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    return rules[0];
  }

  // Check for transaction_name rules first
  const transactionNameRules = userRules.filter(
    (rule) => rule.matchType === "transaction_name" && rule.matchValue === sanitizedName
  );
  const highestTransactionNameRule = getHighestPriorityRule(transactionNameRules);
  if (highestTransactionNameRule) {
    return highestTransactionNameRule.categoryId;
  }

  // Check for merchant_name rules
  const merchantNameRules = userRules.filter(
    (rule) =>
      rule.matchType === "merchant_name" &&
      merchantName.includes(rule.matchValue.toLowerCase())
  );
  const highestMerchantNameRule = getHighestPriorityRule(merchantNameRules);
  if (highestMerchantNameRule) {
    return highestMerchantNameRule.categoryId;
  }

  // Check for transaction_description rules
  const transactionDescriptionRules = userRules.filter(
    (rule) =>
      rule.matchType === "transaction_description" &&
      transactionDesc.includes(rule.matchValue.toLowerCase())
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

  // 2) Force "Other" if personal_finance_category.detailed is in TRANSFER_DETAILED_CATEGORIES
  const detailedCat = transactionOrStream.personal_finance_category?.detailed ?? "";
  if (TRANSFER_DETAILED_CATEGORIES.has(detailedCat)) {
    return null;
  }

  // 3) Otherwise, format the Plaid primary category
  const primaryCatRaw = transactionOrStream.personal_finance_category?.primary ?? null;
  const categoryName = formatPlaidCategoryName(primaryCatRaw) || "";

  // 4) Check if that category is in the DB; else fallback to "Other"
  let finalCategoryId = categoryMap[categoryName] || null;

  // 5) If we ended up with "Other" because we didn't find the category,
  //    or the primary category was literally "Other", we won't create a new rule.
  //    Otherwise, create a new rule for "plaid_primary_category" if it doesn't exist.
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
      // Insert a new rule mapping this raw primary category to finalCategoryId
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

  // 6) New logic: Check again for a "transaction_name" rule by performing a fresh DB query,
  //     ordered by descending priority to ensure the highest priority rule is used.
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


/**
 * Initial endpoint that fetches transactions from Plaid and assigns them
 * a "first pass" category using only Plaid's `personal_finance_category`.
 *
 * Now also creates categorization rules by using determineCategoryIdForTransaction.
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

  // Pre-fetch all existing categorization rules for the user
  const userRules = await db
    .select()
    .from(categorizationRules)
    .where(eq(categorizationRules.userId, userId));

  // Insert transactions into the DB with a "first pass" category
  await Promise.all(
    plaidTransactions.map(async (transaction) => {
      // 1. Skip if no matching account
      const accountId = accountIdMap[transaction.account_id];
      if (!accountId) return;

      // 2. Determine the category using the helper function.
      const categoryId = await determineCategoryIdForTransaction(
        transaction,
        userRules,
        categoryMap,
        userId
      );

      // 3. Determine the sign of the amount
      let amount: number;
      const lowerName = transaction.name.toLowerCase();
      if (lowerName.includes("withdraw")) {
        amount = Math.abs(transaction.amount) * -1;
      } else if (lowerName.includes("deposit")) {
        amount = Math.abs(transaction.amount);
      } else {
        amount = transaction.amount * -1;
      }

      // 4. Insert the transaction
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
