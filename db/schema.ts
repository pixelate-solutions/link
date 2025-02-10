import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  plaidAccountId: text('plaid_account_id'),
  plaidAccessToken: text('plaid_access_token'),
  name: text('name').notNull(),
  category: text('category'),
  currentBalance: text('current_balance').default('0'),
  availableBalance: text('available_balance'),
  plaidType: text('plaid_type'),
  isFromPlaid: boolean('is_from_plaid').notNull().default(true),
});

export const accountsRelations = relations(accounts, ({ many }) => ({
  transactions: many(transactions),
}));

export const insertAccountSchema = createInsertSchema(accounts);

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  name: text("name"),
  type: text("type"),
  plaidCategoryId: text("plaid_category_id"),
  isFromPlaid: boolean("is_from_plaid").default(false),
  budgetAmount: text("budget_amount"),
  isDefault: boolean("is_default").default(false).notNull(),
});

export const categoriesRelations = relations(categories, ({ many }) => ({
  transactions: many(transactions),
}));

export const insertCategorySchema = createInsertSchema(categories);

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  amount: text("amount").notNull(),
  payee: text("payee"),
  notes: text("notes"),
  date: timestamp("date", { mode: "date" }).notNull(),
  accountId: text("account_id")
    .references(() => accounts.id, {
      onDelete: "cascade",
    })
    .notNull(),
  categoryId: text("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  isFromPlaid: boolean("is_from_plaid").default(false).notNull(),
  plaidTransactionId: text("plaid_transaction_id").unique().notNull(),
});

export const transactionsRelations = relations(transactions, ({ one }) => ({
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  categories: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
}));

export const insertTransactionSchema = createInsertSchema(transactions, {
  date: z.coerce.date(),
});

export const stripeCustomers = pgTable('stripe_customers', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  stripeCustomerId: text('stripe_customer_id').notNull(),
});

export const insertStripeCustomerSchema = createInsertSchema(stripeCustomers);

export const userTokens = pgTable('user_tokens', {
  id: text('id').notNull().primaryKey(),
  userId: text('user_id').notNull(),
  accessToken: text('access_token').notNull(),
  cursor: text('cursor'),
  itemId: text('item_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertUserTokensSchema = createInsertSchema(userTokens);

export const chatAccess = pgTable("chat_access", {
  customerId: text("customer_id").notNull(),
  allowAccess: boolean("allow_access").notNull().default(false),
});

export const recurringTransactions = pgTable("recurring_transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(), // Name of the recurring transaction
  payee: text("payee"),
  accountId: text("account_id").notNull(), // Account associated with the transaction
  categoryId: text("category_id").references(() => categories.id, { // Store categoryId instead of categoryName
    onDelete: "set null",
  }),
  frequency: text("frequency").notNull(), // Frequency (e.g., daily, weekly, monthly)
  averageAmount: text("average_amount").notNull(), // Average amount (stored as text)
  lastAmount: text("last_amount"), // Last transaction amount (stored as text)
  date: timestamp("date", { mode: "date" }).notNull(), // New date column for recurring transactions
  isActive: text("is_active").notNull(), // Is the transaction currently active? (text to match the type)
  streamId: text("stream_id").notNull(),
});

export const recurringTransactionsRelations = relations(recurringTransactions, ({ one }) => ({
  account: one(accounts, {
    fields: [recurringTransactions.accountId],
    references: [accounts.id],
  }),
  category: one(categories, { // Updated relation to reference categories
    fields: [recurringTransactions.categoryId],
    references: [categories.id],
  }),
}));

// Create the insert schema
export const insertRecurringTransactionSchema = createInsertSchema(recurringTransactions, {
  date: z.coerce.date(), // Include the new date field in the insert schema
});

export const transactionUpdates = pgTable('transaction_updates', {
  id: text('id').primaryKey().unique(),
  userId: text('user_id').notNull().unique(),
  itemId: text('item_id').notNull(),
  lastUpdated: timestamp('last_updated').defaultNow().notNull(),
});

export const referrals = pgTable('referrals', {
  id: text('id').primaryKey(), // Referral record ID
  userId: text('user_id').notNull(), // Referring user's ID
  effectiveDate: text('effective_date').notNull(), // Date in MM-DD-YYYY format
  amount: integer('amount').notNull(), // Amount of the referral credit
  applied: boolean('applied').default(false), // Whether the credit has been applied
});

export const insertReferralSchema = createInsertSchema(referrals);

export const lifetimePurchases = pgTable('lifetime_purchases', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  isLifetime: boolean('is_lifetime').notNull().default(false),
});

export const insertLifetimePurchaseSchema = createInsertSchema(lifetimePurchases);

export const categorizationRules = pgTable("categorization_rules", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  categoryId: text("category_id")
    .references(() => categories.id, { onDelete: "cascade" })
    .notNull(), // Points to the categories table
  matchType: text("match_type").notNull(),
  matchValue: text("match_value").notNull(),
  priority: integer("priority").notNull().default(1),
  date: timestamp("date", { mode: "date" }).notNull(),
});

export const categorizationRulesRelations = relations(categorizationRules, ({ one }) => ({
  category: one(categories, {
    fields: [categorizationRules.categoryId],
    references: [categories.id],
  }),
}));

export const insertCategorizationRuleSchema = createInsertSchema(categorizationRules, {
  priority: z.number().min(1).default(1),
});

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  toggled: boolean("toggled").notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications);