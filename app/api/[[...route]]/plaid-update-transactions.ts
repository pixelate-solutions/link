import { Hono } from "hono";
import { db } from "@/db/drizzle";
import {
  accounts,
  transactions,
  userTokens,
  categories,
  recurringTransactions,
  categorizationRules,
  notifications
} from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import plaidClient from "./plaid";
import { eq, and, desc, gte, lt } from "drizzle-orm";
import { AxiosError } from "axios";
import { clerkMiddleware } from "@hono/clerk-auth";
import nodemailer from "nodemailer";
import { clerkClient } from "@clerk/express";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const app = new Hono();

interface PlaidErrorResponse {
  error_code: string;
  error_message: string;
}

const TRANSFER_DETAILED_CATEGORIES = new Set<string>([
  "TRANSFER_IN_DEPOSIT",
  "TRANSFER_IN_CASH_ADVANCES_AND_LOANS",
  "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS",
  "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS",
  "TRANSFER_OUT_WITHDRAWAL",
]);

/**
 * Convert a Plaid primary category like "FOOD_AND_DRINK" into a more human-friendly name.
 */
function formatPlaidCategoryName(category: string): string {
  const splitted = category.split("_");
  const processed = splitted.map((word) => {
    if (word.toUpperCase() === "AND") {
      return "/";
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
  let joined = processed.join(" ");
  joined = joined.replace(/\s+\/\s+/g, "/");
  return joined;
}

/**
 * Helper to sanitize a transaction name by removing numbers.
 */
function sanitizeTransactionName(name: string): string {
  return name.replace(/\d+/g, '').trim().toLowerCase();
}

/**
 * Revamped sendEmail function.
 *
 * If a userId is provided and no explicit recipient email is passed,
 * the function fetches the user's primary email address from Clerk.
 * The email is formatted with an official header (including a logo) and footer.
 */
export const sendEmail = async (body: string, userId?: string, to?: string) => {
  try {
    let recipient = to;
    if (!recipient && userId) {
      // Get the user's primary email address from Clerk
      const user = await clerkClient.users.getUser(userId);
      recipient = user.emailAddresses[0].emailAddress;
    }
    if (!recipient) {
      recipient = "support@budgetwithlink.com";
    }

    const subject = "Link Notification";
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    const htmlContent = `
      <html>
        <head>
          <style>
            body {
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
            }
            .container {
              background-color: #ffffff;
              max-width: 600px;
              margin: 40px auto;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
            }
            .header {
              background-color: #4a90e2;
              color: #ffffff;
              padding: 24px;
              text-align: center;
              border-top-left-radius: 12px;
              border-top-right-radius: 12px;
            }
            .header h1 {
              margin: 0;
              font-size: 22px;
              font-weight: 600;
            }
            .logo {
              max-width: 60px;
              margin-bottom: 12px;
            }
            .content {
              padding: 24px;
              font-size: 16px;
              line-height: 1.6;
              color: #333333;
              text-align: center;
            }
            .footer {
              background-color: #f7f7f7;
              text-align: center;
              padding: 12px;
              font-size: 12px;
              color: #777777;
              border-bottom-left-radius: 12px;
              border-bottom-right-radius: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <img class="logo" src="https://www.budgetwithlink.com/caution.png" alt="Caution Icon">
              <h1>Link Alert</h1>
            </div>
            <div class="content">
              ${body.replace(/\n/g, "<br/>")}
            </div>
            <div class="footer">
              &copy; ${new Date().getFullYear()} LinkLogic LLC. All Rights Reserved.
            </div>
          </div>
        </body>
      </html>
    `;

    const mailOptions = {
      from: process.env.SMTP_USER,
      to: recipient,
      subject,
      html: htmlContent,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

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
        const { added, modified, removed, next_cursor, has_more, accounts: plaidAccounts } = response.data;

        if (plaidAccounts && Array.isArray(plaidAccounts)) {
          for (const account of plaidAccounts) {
            const { account_id, balances, type, subtype, official_name } = account;
            let { current, available } = balances;
            
            // Normalize balances based on account type
            if (type === "credit" || (type === "loan" && subtype !== "student")) {
              current = -Math.abs(current || 0);
              available = available !== null ? Math.abs(available) : null;
            } else if (type === "loan" && subtype === "student" && official_name?.includes("Sallie Mae")) {
              current = -Math.abs(current || 0);
            } else {
              current = Math.abs(current || 0);
              available = available !== null ? Math.abs(available) : null;
            }
            
            await db
              .update(accounts)
              .set({
                currentBalance: current?.toString() || "0",
                availableBalance: available !== null ? available.toString() : "0",
              })
              .where(eq(accounts.plaidAccountId, account_id))
              .execute();
          }
        }

        // Update account balances in DB
        for (const account of plaidAccounts) {
          const { account_id, balances, type, subtype } = account;
          let { current, available } = balances;
          if (type === "credit" || (type === "loan" && subtype !== "student")) {
            current = -Math.abs(current || 0);
            available = available !== null ? Math.abs(available) : null;
          } else if (type === "loan" && subtype === "student" && account.official_name?.includes("Sallie Mae")) {
            current = -Math.abs(current || 0);
          } else {
            current = Math.abs(current || 0);
            available = available !== null ? Math.abs(available) : null;
          }
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
            `Invalid access token for userId ${userId} & access token ${accessToken} & Item ID ${item_id}.`,
            undefined,
            "support@budgetwithlink.com"
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
      const response = await plaidClient.transactionsRecurringGet({ access_token: accessToken });
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
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    return rules[0];
  }
  // Check transaction_name rules
  const transactionNameRules = userRules.filter(
    (rule) => rule.matchType === "transaction_name" && rule.matchValue === sanitizedName
  );
  const highestTransactionNameRule = getHighestPriorityRule(transactionNameRules);
  if (highestTransactionNameRule) return highestTransactionNameRule.categoryId;
  // Check merchant_name rules
  const merchantNameRules = userRules.filter(
    (rule) => rule.matchType === "merchant_name" && merchantName.includes(rule.matchValue.toLowerCase())
  );
  const highestMerchantNameRule = getHighestPriorityRule(merchantNameRules);
  if (highestMerchantNameRule) return highestMerchantNameRule.categoryId;
  // Check transaction_description rules
  const transactionDescriptionRules = userRules.filter(
    (rule) => rule.matchType === "transaction_description" && transactionDesc.includes(rule.matchValue.toLowerCase())
  );
  const highestTransactionDescriptionRule = getHighestPriorityRule(transactionDescriptionRules);
  if (highestTransactionDescriptionRule) return highestTransactionDescriptionRule.categoryId;
  // Check transaction_type rules
  const transactionTypeRules = userRules.filter(
    (rule) => rule.matchType === "transaction_type" && transactionType === rule.matchValue
  );
  const highestTransactionTypeRule = getHighestPriorityRule(transactionTypeRules);
  if (highestTransactionTypeRule) return highestTransactionTypeRule.categoryId;
  // Force "Other" if personal_finance_category.detailed is in TRANSFER_DETAILED_CATEGORIES
  const detailedCat = transactionOrStream.personal_finance_category?.detailed ?? "";
  if (TRANSFER_DETAILED_CATEGORIES.has(detailedCat)) return null;
  // Otherwise, format the Plaid primary category
  const primaryCatRaw = transactionOrStream.personal_finance_category?.primary ?? null;
  const categoryName = formatPlaidCategoryName(primaryCatRaw) || "";
  let finalCategoryId = categoryMap[categoryName] || null;
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
 * Processes standard (non-recurring) transactions from Plaid.
 */
async function processTransactions(plaidTransactions: any[], userId: string, itemId: string) {
  const dbAccounts = await db
    .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  const accountIdMap = dbAccounts.reduce((map, account) => {
    if (account.plaidAccountId) map[account.plaidAccountId] = account.id;
    return map;
  }, {} as Record<string, string>);
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
    if (c.name) map[c.name] = c.id;
    return map;
  }, {} as Record<string, string>);
  await Promise.all(
    plaidTransactions.map(async (transaction) => {
      const accountId = accountIdMap[transaction.account_id];
      if (!accountId) return;
      const categoryId = await determineCategoryIdForTransaction(
        transaction,
        userRules,
        categoryMap,
        userId
      );
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
        console.log("SKIPPING EXISTING TRANSACTION");
        return;
      }
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
 */
async function processRecurringTransactions(plaidData: any, userId: string) {
  const dbAccounts = await db
    .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
    .from(accounts)
    .where(eq(accounts.userId, userId));
  const accountIdMap = dbAccounts.reduce((map, account) => {
    if (account.plaidAccountId) map[account.plaidAccountId] = account.id;
    return map;
  }, {} as Record<string, string>);
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
    if (c.name) map[c.name] = c.id;
    return map;
  }, {} as Record<string, string>);
  const inflowStreams = plaidData.inflow_streams || [];
  const outflowStreams = plaidData.outflow_streams || [];
  const allStreams = [...inflowStreams, ...outflowStreams];
  await Promise.all(
    allStreams.map(async (stream) => {
      const accountId = accountIdMap[stream.account_id];
      if (!accountId) return null;
      const categoryId = await determineCategoryIdForTransaction(
        stream,
        userRules,
        categoryMap,
        userId
      );
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
      // Update the existing recurring transaction with new data from Plaid
      return db
        .update(recurringTransactions)
        .set({
          name: stream.description,
          payee: stream.merchant_name
            ? stream.merchant_name
                .split(" ")
                .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(" ")
            : "Unknown",
          categoryId, // determined earlier in your logic
          frequency: stream.frequency
            .split("_")
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(" "),
          averageAmount: ((stream.average_amount?.amount ?? 0) * -1).toString(),
          lastAmount: ((stream.last_amount?.amount ?? 0) * -1).toString(),
          date: new Date(stream.last_date),
          isActive: stream.is_active.toString()
        })
        .where(
          and(
            eq(recurringTransactions.streamId, stream.stream_id),
            eq(recurringTransactions.userId, userId)
          )
        )
        .returning();
    } else {
      // Insert the new recurring transaction
      return db
        .insert(recurringTransactions)
        .values({
          id: createId(),
          userId,
          name: stream.description,
          accountId,
          payee: stream.merchant_name
            ? stream.merchant_name
                .split(" ")
                .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(" ")
            : "Unknown",
          categoryId,
          frequency: stream.frequency
            .split("_")
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(" "),
          averageAmount: ((stream.average_amount?.amount ?? 0) * -1).toString(),
          lastAmount: ((stream.last_amount?.amount ?? 0) * -1).toString(),
          date: new Date(stream.last_date),
          isActive: stream.is_active.toString(),
          streamId: stream.stream_id
        })
        .returning();
      }
    })
  );
}

/**
 * Primary webhook endpoint for handling Plaid transaction updates.
 */
app.post("/transactions", clerkMiddleware(), async (ctx) => {
  const { webhook_code, webhook_type, item_id, removed_transactions } = await ctx.req.json();
  if (!item_id) return ctx.json({ error: "Missing item_id" }, 400);
  const userTokensResult = await db
    .select({ userId: userTokens.userId, accessToken: userTokens.accessToken, cursor: userTokens.cursor })
    .from(userTokens)
    .where(eq(userTokens.itemId, item_id))
    .orderBy(desc(userTokens.createdAt));
  const userToken = userTokensResult[0];
  if (!userToken) return ctx.json({ error: "Access token not found" }, 404);
  const { userId, accessToken, cursor: initialCursor } = userToken;
  if (webhook_type === "TRANSACTIONS") {
    switch (webhook_code) {
      case "SYNC_UPDATES_AVAILABLE":
      case "RECURRING_TRANSACTIONS_UPDATE": {
        // === Define the current month window ===
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const nextMonth = new Date(startOfMonth);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        // === Check the BudgetExceeded notification setting for this user ===
        const notificationResult = await db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              eq(notifications.name, "BudgetExceeded")
            )
          );
        let shouldNotify = false;
        let absSumBefore = 0;
        let totalBudget = 0;
        if (notificationResult.length > 0 && notificationResult[0].toggled) {
          shouldNotify = true;
          // Compute spending before processing transactions
          const spendingBeforeRows = await db
            .select({ amount: transactions.amount, date: transactions.date, categoryId: transactions.categoryId })
            .from(transactions)
            .where(
              and(
                eq(transactions.userId, userId),
                gte(transactions.date, startOfMonth),
                lt(transactions.date, nextMonth)
              )
            );
          // Get IDs of transfer categories for this user
          const transferCategoriesRows = await db
            .select({ id: categories.id })
            .from(categories)
            .where(and(eq(categories.userId, userId), eq(categories.type, "transfer")));
          const transferCategoryIds = transferCategoriesRows.map(r => r.id);
          let sumBefore = 0;
          for (const tx of spendingBeforeRows) {
            const amt = parseFloat(tx.amount);
            if (amt < 0 && (!tx.categoryId || !transferCategoryIds.includes(tx.categoryId))) {
              sumBefore += amt;
            }
          }
          absSumBefore = Math.abs(sumBefore);
          // Sum all monthly budget amounts from categories
          const budgetCategories = await db
            .select({ budgetAmount: categories.budgetAmount })
            .from(categories)
            .where(eq(categories.userId, userId));
          for (const cat of budgetCategories) {
            const budget = parseFloat(cat.budgetAmount || "0");
            if (!isNaN(budget)) {
              totalBudget += budget;
            }
          }
        }
        // === Process transactions as before ===
        const plaidTransactions = await fetchPlaidTransactionsWithRetry(
          accessToken,
          initialCursor,
          item_id,
          userId
        );
        if (!plaidTransactions) {
          await sendEmail("Failed to fetch transactions after multiple attempts.", undefined, "support@budgetwithlink.com");
          return ctx.json({ error: "Failed to fetch transactions after multiple attempts" }, 500);
        }
        await processTransactions(plaidTransactions, userId, item_id);
        const plaidRecurringTransactions = await fetchRecurringTransactionsWithRetry(accessToken);
        if (!plaidRecurringTransactions) {
          return ctx.json({ error: "Failed to fetch recurring transactions after multiple attempts" }, 500);
        }
        await processRecurringTransactions(plaidRecurringTransactions, userId);
        // === Compute spending after processing transactions if notification is toggled on ===
        if (shouldNotify) {
          const spendingAfterRows = await db
            .select({ amount: transactions.amount, date: transactions.date, categoryId: transactions.categoryId })
            .from(transactions)
            .where(
              and(
                eq(transactions.userId, userId),
                gte(transactions.date, startOfMonth),
                lt(transactions.date, nextMonth)
              )
            );
          let sumAfter = 0;
          // Reuse transfer category IDs
          const transferCategoriesRows = await db
            .select({ id: categories.id })
            .from(categories)
            .where(and(eq(categories.userId, userId), eq(categories.type, "transfer")));
          const transferCategoryIds = transferCategoriesRows.map(r => r.id);
          for (const tx of spendingAfterRows) {
            const amt = parseFloat(tx.amount);
            if (amt < 0 && (!tx.categoryId || !transferCategoryIds.includes(tx.categoryId))) {
              sumAfter += amt;
            }
          }
          const absSumAfter = Math.abs(sumAfter);
          // === Comparison: Trigger over-budget notification if condition met ===
          if (absSumBefore <= totalBudget && absSumAfter > totalBudget) {
            // Send the over-budget email to the user (using their primary email via Clerk)
            await sendEmail(
              `You have gone over budget for this month.\n\nCurrent spending this month: $${absSumAfter.toFixed(2)}\n\nMonthly budget: $${totalBudget.toFixed(2)}`,
              userId 
            );
          }
        }
        break;
      }
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
        break;
      default:
        await sendEmail(`Unrecognized webhook code: ${webhook_code}`, undefined, "support@budgetwithlink.com");
        console.log(`Unrecognized webhook code: ${webhook_code}`);
        return ctx.json({ message: `Webhook code ${webhook_code} not handled` }, 200);
    }
  } else if (webhook_type === "ITEM") {
    switch (webhook_code) {
      case "WEBHOOK_UPDATE_ACKNOWLEDGED":
        break;
      default:
        await sendEmail(`Unrecognized ITEM webhook code: ${webhook_code}`, undefined, "support@budgetwithlink.com");
        console.log(`Unrecognized ITEM webhook code: ${webhook_code}`);
        return ctx.json({ message: `ITEM Webhook code ${webhook_code} not handled` }, 200);
    }
  } else {
    await sendEmail(`Unrecognized webhook type: ${webhook_type}`, undefined, "support@budgetwithlink.com");
    return ctx.json({ error: "Unrecognized webhook type" }, 400);
  }
  return ctx.json({ message: "Webhook processed successfully." });
});

app.get("/transactions", clerkMiddleware(), async (ctx) => {
  return ctx.json({ message: "Plaid Transactions Webhook" }, 200);
});

app.post("/email", clerkMiddleware(), async (ctx) => {
  const { body, userId } = await ctx.req.json();
  await sendEmail(body, userId);
})

export default app;
