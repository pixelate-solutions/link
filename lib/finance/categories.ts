/**
 * Link uses one fixed, small category taxonomy instead of user-maintained
 * category lists. Users correct individual transactions or write rules; they
 * never have to build the taxonomy themselves.
 */
export type CategoryGroup = "income" | "essential" | "discretionary" | "transfer" | "savings";

export interface CategoryDef {
  id: string;
  label: string;
  group: CategoryGroup;
  /** Spending that tends to arrive in lumps rather than monthly. */
  irregular?: boolean;
}

export const CATEGORIES = [
  { id: "paycheck", label: "Paycheck", group: "income" },
  { id: "other_income", label: "Other income", group: "income" },
  { id: "interest", label: "Interest & dividends", group: "income" },

  { id: "housing", label: "Housing", group: "essential" },
  { id: "utilities", label: "Utilities", group: "essential" },
  { id: "groceries", label: "Groceries", group: "essential" },
  { id: "transport", label: "Transport", group: "essential" },
  { id: "fuel", label: "Gas & fuel", group: "essential" },
  { id: "insurance", label: "Insurance", group: "essential" },
  { id: "healthcare", label: "Healthcare", group: "essential" },
  { id: "childcare", label: "Childcare & education", group: "essential" },
  { id: "debt_interest", label: "Loan payments", group: "essential" },
  { id: "taxes", label: "Taxes", group: "essential", irregular: true },
  { id: "fees", label: "Fees", group: "essential" },

  { id: "dining", label: "Dining", group: "discretionary" },
  { id: "shopping", label: "Shopping", group: "discretionary" },
  { id: "entertainment", label: "Entertainment", group: "discretionary" },
  { id: "subscriptions", label: "Subscriptions", group: "discretionary" },
  { id: "travel", label: "Travel", group: "discretionary", irregular: true },
  { id: "personal_care", label: "Personal care", group: "discretionary" },
  { id: "home", label: "Home & garden", group: "discretionary", irregular: true },
  { id: "gifts", label: "Gifts & giving", group: "discretionary", irregular: true },
  { id: "pets", label: "Pets", group: "discretionary" },
  { id: "services", label: "Services", group: "discretionary" },
  { id: "general", label: "Other spending", group: "discretionary" },

  { id: "transfer", label: "Transfer", group: "transfer" },
  { id: "card_payment", label: "Card payment", group: "transfer" },
  { id: "investment", label: "Investing", group: "savings" },
] as const satisfies readonly CategoryDef[];

export type CategoryId = (typeof CATEGORIES)[number]["id"];

const byId = new Map<string, CategoryDef>(CATEGORIES.map((c) => [c.id, c]));

export function isCategoryId(id: string): id is CategoryId {
  return byId.has(id);
}

export function category(id: string): CategoryDef {
  return byId.get(id) ?? byId.get("general")!;
}

export function categoryLabel(id: string | null | undefined): string {
  return id ? category(id).label : "Uncategorized";
}

export const SPENDING_CATEGORIES = CATEGORIES.filter(
  (c) => c.group === "essential" || c.group === "discretionary",
).map((c) => c.id as CategoryId);

/**
 * Transaction kind describes what the money movement *is*; category describes
 * what it was *for*. Only `expense` (and refunds netted against it) counts as
 * spending; only `income` counts as income. Transfers and card payments move
 * money between the user's own accounts and must never be double counted.
 */
export const TRANSACTION_KINDS = [
  "income",
  "expense",
  "refund",
  "transfer",
  "card_payment",
  "investment_transfer",
  "loan_payment",
  "fee",
  "other",
] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export function countsAsSpending(kind: TransactionKind): boolean {
  return kind === "expense" || kind === "refund" || kind === "fee" || kind === "loan_payment";
}

export function countsAsIncome(kind: TransactionKind): boolean {
  return kind === "income";
}
