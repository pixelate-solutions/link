import { Hono } from "hono";
import { db } from "@/db/drizzle";
import {
  accounts,
  transactions,
  userTokens,
  categories,
  recurringTransactions,
  categorizationRules
} from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import plaidClient from "./plaid";
import { eq, and, desc } from "drizzle-orm";
import { AxiosError } from "axios";
import { clerkMiddleware } from "@hono/clerk-auth";
import nodemailer from "nodemailer";

const AI_URL = process.env.NEXT_PUBLIC_AI_URL;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const app = new Hono();

interface PlaidErrorResponse {
  error_code: string;
  error_message: string;
}

// A set of Plaid detailed categories that should always be forced to "Other"
const TRANSFER_DETAILED_CATEGORIES = new Set<string>([
  "TRANSFER_IN_DEPOSIT",
  "TRANSFER_IN_CASH_ADVANCES_AND_LOANS",
  "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS",
  "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS",
  "TRANSFER_OUT_WITHDRAWAL",
]);

/**
 * Convert a Plaid primary category like "FOOD_AND_DRINK" into a more human-friendly name:
 * - Splits on underscores
 * - Replaces "AND" with "/"
 * - Capitalizes each piece
 * - Joins them with spaces, removing spaces around "/"
 */
function formatPlaidCategoryName(category: string): string {
  const splitted = category.split("_"); // e.g. ["FOOD", "AND", "DRINK"]
  const processed = splitted.map((word) => {
    if (word.toUpperCase() === "AND") {
      return "/";
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
  let joined = processed.join(" ");
  // Remove spaces around slashes
  joined = joined.replace(/\s+\/\s+/g, "/");
  return joined;
}

/**
 * Helper to sanitize a transaction name by removing numbers.
 * This ensures that names like "Check Paid #20143" and "Check Paid #19243" are treated as equivalent.
 */
function sanitizeTransactionName(name: string): string {
  return name.replace(/\d+/g, '').trim().toLowerCase();
}

export const sendEmail = async (body: string) => {
  try {
    const to = "support@budgetwithlink.com";
    const subject = "TRANSACTION WEBHOOK";

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
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
    console.error("Error sending email:", error);
  }
};

// Type guard to check if the error is an AxiosError
const isAxiosError = (error: unknown): error is AxiosError => {
  return (error as AxiosError).isAxiosError !== undefined;
};

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

        const {
          added,
          modified,
          removed,
          next_cursor,
          has_more,
          accounts: plaidAccounts,
        } = response.data;

        // Update account balances in DB
        for (const account of plaidAccounts) {
          const { account_id, balances, type, subtype } = account;
          let { current, available } = balances;

          // Adjust sign for credit/loan
          if (type === "credit" || (type === "loan" && subtype !== "student")) {
            // Positive balance = debt
            current = -Math.abs(current || 0);
            available = available !== null ? Math.abs(available) : null;
          } else if (
            type === "loan" &&
            subtype === "student" &&
            account.official_name?.includes("Sallie Mae")
          ) {
            // Student loan for Sallie Mae
            current = -Math.abs(current || 0);
          } else {
            // Asset accounts remain positive
            current = Math.abs(current || 0);
            available = available !== null ? Math.abs(available) : null;
          }

          // Update in DB
          await db
            .update(accounts)
            .set({
              currentBalance: current?.toString() || "0",
              availableBalance: available?.toString() || "0",
            })
            .where(eq(accounts.plaidAccountId, account_id))
            .execute();
        }

        const newTransactions = added
          .concat(modified)
          .filter((t: any) => t.transaction_code !== "transfer")
          .filter((t: any) => {
            const catCheck = (cat: string) => cat.toLowerCase().includes("transfer");
            const nameCheck = (nm: string | undefined) =>
              nm?.toLowerCase().includes("check") || nm?.toLowerCase().includes("pay");

            const detailedCategory = t.personal_finance_category?.detailed ?? "";
            const primaryCategory = t.personal_finance_category?.primary ?? "";
            const name = t.name ?? "";

            return !(catCheck(detailedCategory) || catCheck(primaryCategory)) || nameCheck(name);
          });

        allTransactions.push(...newTransactions);
        cursor = next_cursor;
        hasMore = has_more;
      }

      // Store cursor for next sync
      await db
        .update(userTokens)
        .set({ cursor })
        .where(and(eq(userTokens.userId, userId), eq(userTokens.itemId, item_id)))
        .execute();

      return allTransactions;
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        console.error("Error syncing transactions:", error);
        const errorResponse = error.response?.data as PlaidErrorResponse;
        if (errorResponse?.error_code === "INVALID_ACCESS_TOKEN") {
          await sendEmail(
            `Invalid access token for userId ${userId} & access token ${accessToken} & Item ID ${item_id}.`
          );
          console.warn(`Skipping access token for item ${item_id} due to invalid token.`);
          return [];
        }
        if (attempts >= MAX_RETRIES - 1) {
          console.error("Max retries reached. Failing sync.");
          throw new Error("Failed to sync transactions after multiple attempts.");
        }
      } else {
        console.error("Unknown error:", error);
        throw new Error("An unknown error occurred.");
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      attempts++;
    }
  }
  return null;
};

async function fetchRecurringTransactionsWithRetry(accessToken: string) {
  let attempts = 0;
  while (attempts < MAX_RETRIES) {
    try {
      const response = await plaidClient.transactionsRecurringGet({
        access_token: accessToken,
      });
      return response.data;
    } catch (error) {
      if (attempts >= MAX_RETRIES - 1) {
        throw new Error("Failed to fetch recurring transactions after multiple attempts.");
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      attempts++;
    }
  }
  return null;
}

/**
 * Determine the best category for a transaction (or stream), respecting user overrides,
 * forced "Other" logic, and creating new categorization rules as needed.
 *
 * Now also checks for a transaction name rule by sanitizing the name (ignoring numbers).
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

  // 1) Check user-defined rules first (including transaction_name rules)
  for (const rule of userRules) {
    if (rule.matchType === "transaction_name" && rule.matchValue === sanitizedName) {
      return rule.categoryId;
    }
    if (rule.matchType === "merchant_name" && merchantName.includes(rule.matchValue.toLowerCase())) {
      return rule.categoryId;
    }
    if (
      rule.matchType === "transaction_description" &&
      transactionDesc.includes(rule.matchValue.toLowerCase())
    ) {
      return rule.categoryId;
    }
    if (rule.matchType === "transaction_type" && transactionType === rule.matchValue) {
      return rule.categoryId;
    }
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

  // 6) New logic: Check for a "transaction_name" rule based on the sanitized name.
  //     If one exists, override finalCategoryId; if not and we have a category, insert a new rule.
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
        matchValue: sanitizedName,
        priority: 1,
        date: new Date(),
      });
    }
  }

  return finalCategoryId;
}

/**
 * Processes standard (non-recurring) transactions from Plaid.
 * Respects user-defined rules, forced-other logic, and
 * will create new rules for "plaid_primary_category" (and now for "transaction_name").
 */
async function processTransactions(plaidTransactions: any[], userId: string, itemId: string) {
  // 1. Fetch user accounts
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

  // 2. Fetch all user rules & categories
  const userRules = await db
    .select()
    .from(categorizationRules)
    .where(eq(categorizationRules.userId, userId))
    .orderBy(desc(categorizationRules.priority), desc(categorizationRules.date));

  const dbCategories = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.userId, userId));

  const categoryMap = dbCategories.reduce((map, c) => {
    if (c.name) {
      map[c.name] = c.id;
    }
    return map;
  }, {} as Record<string, string>);

  // 3. Insert or update each Plaid transaction
  await Promise.all(
    plaidTransactions.map(async (transaction) => {
      const accountId = accountIdMap[transaction.account_id];
      if (!accountId) return;

      // 3a. Determine category
      const categoryId = await determineCategoryIdForTransaction(
        transaction,
        userRules,
        categoryMap,
        userId
      );

      // 3b. Decide sign of amount
      let amount: number;
      const lowerName = transaction.name?.toLowerCase() || "";
      if (lowerName.includes("withdraw")) {
        amount = Math.abs(transaction.amount) * -1;
      } else if (lowerName.includes("deposit")) {
        amount = Math.abs(transaction.amount);
      } else {
        amount = transaction.amount * -1;
      }

      const existingTx = await db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.plaidTransactionId, transaction.transaction_id),
            eq(transactions.userId, userId)
          )
        )
        .limit(1)
        .execute();

      if (existingTx.length > 0) {
        // Already exists: optionally update if you want
        // For now, skip or do minimal updates
        console.log("SKIPPING EXISTING TRANSACTION");
        return;
      }

      // Insert new standard transaction
      await db
        .insert(transactions)
        .values({
          id: createId(),
          userId,
          amount: amount.toString(),
          payee: transaction.name,
          date: new Date(transaction.date),
          accountId,
          categoryId,
          isFromPlaid: true,
          plaidTransactionId: transaction.transaction_id,
        })
        .execute();
    })
  );
}

/**
 * Processes recurring transactions from Plaid.
 * Respects user-defined rules, forced-other logic, and
 * will create new rules for "plaid_primary_category" (and now for "transaction_name").
 */
async function processRecurringTransactions(plaidData: any, userId: string) {
  // 1. Fetch user accounts
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

  // 2. Fetch user rules & categories
  const userRules = await db
    .select()
    .from(categorizationRules)
    .where(eq(categorizationRules.userId, userId))
    .orderBy(desc(categorizationRules.priority), desc(categorizationRules.date));

  const dbCategories = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.userId, userId));

  const categoryMap = dbCategories.reduce((map, c) => {
    if (c.name) {
      map[c.name] = c.id;
    }
    return map;
  }, {} as Record<string, string>);

  // 3. Gather all streams
  const inflowStreams = plaidData.inflow_streams || [];
  const outflowStreams = plaidData.outflow_streams || [];
  const allStreams = [...inflowStreams, ...outflowStreams];

  // 4. Insert each recurring stream if not already present
  await Promise.all(
    allStreams.map(async (stream) => {
      const accountId = accountIdMap[stream.account_id];
      if (!accountId) return null;

      // 4a. Determine category
      const categoryId = await determineCategoryIdForTransaction(
        stream,
        userRules,
        categoryMap,
        userId
      );

      // 4b. Convert amounts to string (negative by default)
      const avgAmt = stream.average_amount?.amount ?? 0;
      const lastAmt = stream.last_amount?.amount ?? 0;
      const averageAmount = (avgAmt * -1).toString();
      const lastAmount = (lastAmt * -1).toString();

      // 4c. Check duplicates by streamId
      const existing = await db
        .select({ id: recurringTransactions.id })
        .from(recurringTransactions)
        .where(and(eq(recurringTransactions.streamId, stream.stream_id), eq(recurringTransactions.userId, userId)));

      if (existing.length > 0) {
        console.log(`Skipping duplicate transaction for streamId: ${stream.stream_id}`);
        return null;
      }

      // 4d. Insert new recurring transaction
      return db
        .insert(recurringTransactions)
        .values({
          id: createId(),
          userId,
          name: stream.description,
          accountId,
          payee:
            stream.merchant_name
              ?.split(" ")
              .map(
                (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
              )
              .join(" ") || "Unknown",
          categoryId,
          frequency: stream.frequency
            .split("_")
            .map(
              (word: string) =>
                word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            )
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
}

/**
 * Primary webhook endpoint for handling Plaid transaction updates.
 */
app.post("/transactions", clerkMiddleware(), async (ctx) => {
  const { webhook_code, webhook_type, item_id, removed_transactions } =
    await ctx.req.json();

  if (!item_id) {
    return ctx.json({ error: "Missing item_id" }, 400);
  }

  // Fetch user token + access
  const userTokensResult = await db
    .select({
      userId: userTokens.userId,
      accessToken: userTokens.accessToken,
      cursor: userTokens.cursor,
    })
    .from(userTokens)
    .where(eq(userTokens.itemId, item_id))
    .orderBy(desc(userTokens.createdAt));

  const userToken = userTokensResult[0];
  if (!userToken) {
    return ctx.json({ error: "Access token not found" }, 404);
  }

  const { userId, accessToken, cursor: initialCursor } = userToken;

  if (webhook_type === "TRANSACTIONS") {
    switch (webhook_code) {
      case "SYNC_UPDATES_AVAILABLE":
      case "RECURRING_TRANSACTIONS_UPDATE":
        // Fetch new/modified transactions
        const plaidTransactions = await fetchPlaidTransactionsWithRetry(
          accessToken,
          initialCursor,
          item_id,
          userId
        );
        if (!plaidTransactions) {
          await sendEmail("Failed to fetch transactions after multiple attempts.");
          return ctx.json({ error: "Failed to fetch transactions after multiple attempts" }, 500);
        }

        // Insert or update them
        await processTransactions(plaidTransactions, userId, item_id);

        // Fetch recurring transactions
        const plaidRecurringTransactions = await fetchRecurringTransactionsWithRetry(accessToken);
        if (!plaidRecurringTransactions) {
          return ctx.json(
            { error: "Failed to fetch recurring transactions after multiple attempts" },
            500
          );
        }
        await processRecurringTransactions(plaidRecurringTransactions, userId);

        break;

      case "TRANSACTIONS_REMOVED":
        if (removed_transactions && removed_transactions.length > 0) {
          try {
            for (const removedTransactionId of removed_transactions) {
              await db
                .delete(transactions)
                .where(
                  and(
                    eq(transactions.userId, userId),
                    eq(transactions.plaidTransactionId, removedTransactionId)
                  )
                )
                .execute();
            }
            console.log(`Successfully removed ${removed_transactions.length} transactions.`);
          } catch (error) {
            console.error("Error processing removed transactions:", error);
            return ctx.json({ error: "Failed to process removed transactions" }, 500);
          }
        }
        break;
      case "INITIAL_UPDATE":
      case "HISTORICAL_UPDATE":
      case "DEFAULT_UPDATE":
        // You could handle these if needed
        break;

      default:
        await sendEmail(`Unrecognized webhook code: ${webhook_code}`);
        console.log(`Unrecognized webhook code: ${webhook_code}`);
        return ctx.json({ message: `Webhook code ${webhook_code} not handled` }, 200);
    }
  } else if (webhook_type === "ITEM") {
    switch (webhook_code) {
      case "WEBHOOK_UPDATE_ACKNOWLEDGED":
        // Webhook URL updated, do any logging if you want
        break;
      default:
        await sendEmail(`Unrecognized ITEM webhook code: ${webhook_code}`);
        console.log(`Unrecognized ITEM webhook code: ${webhook_code}`);
        return ctx.json({ message: `ITEM Webhook code ${webhook_code} not handled` }, 200);
    }
  } else {
    await sendEmail(`Unrecognized webhook type: ${webhook_type}`);
    return ctx.json({ error: "Unrecognized webhook type" }, 400);
  }

  return ctx.json({ message: "Webhook processed successfully." });
});

app.get("/transactions", clerkMiddleware(), async (ctx) => {
  return ctx.json({ message: "Plaid Transactions Webhook" }, 200);
});

export default app;
