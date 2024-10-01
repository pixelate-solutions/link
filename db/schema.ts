import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  plaidAccountId: text('plaid_account_id'),
  name: text('name').notNull(),
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
  plaidCategoryId: text("plaid_category_id"),
  isFromPlaid: boolean("is_from_plaid").default(false),
  budgetAmount: text("budget_amount"),
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
  lifetimePurchase: boolean('lifetime_purchase').default(false),
});

export const insertStripeCustomerSchema = createInsertSchema(stripeCustomers);

export const userTokens = pgTable('user_tokens', {
  id: text('id').notNull().primaryKey(),
  userId: text('user_id').notNull(),
  accessToken: text('access_token').notNull(),
  itemId: text('item_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertUserTokensSchema = createInsertSchema(userTokens);

export const chatAccess = pgTable("chat_access", {
  customerId: text("customer_id").notNull(),
  allowAccess: boolean("allow_access").notNull().default(false),
});

// Define the recurring transactions table
export const recurringTransactions = pgTable("recurring_transactions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(), // Name of the recurring transaction
  accountId: text("account_id").notNull(), // Account associated with the transaction
  merchantName: text("merchant_name").notNull(), // Merchant for the transaction
  categoryName: text("category_name").notNull(), // Category name for the transaction
  frequency: text("frequency").notNull(), // Frequency (e.g., daily, weekly, monthly)
  averageAmount: text("average_amount").notNull(), // Average amount (stored as text)
  lastAmount: text("last_amount").notNull(), // Last transaction amount (stored as text)
  isActive: text("is_active").notNull(), // Is the transaction currently active? (text to match the type)
});

// Define the relationships, assuming this will relate to the accounts and categories tables
export const recurringTransactionsRelations = relations(recurringTransactions, ({ one }) => ({
  account: one(accounts, {
    fields: [recurringTransactions.accountId],
    references: [accounts.id],
  }),
  // Add relationships for categories if required
}));

// Create the insert schema
export const insertRecurringTransactionSchema = createInsertSchema(recurringTransactions);
