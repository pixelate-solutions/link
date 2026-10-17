import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { BudgetItem } from "@/lib/finance/budget";
import { type CategoryId, type TransactionKind } from "@/lib/finance/categories";
import { toCategoryId, type AccountType } from "@/lib/finance/classify";
import { addDays, todayISO } from "@/lib/finance/dates";
import type { FactKey, GoalInterpretation, GoalKind } from "@/lib/finance/goals";
import type { LedgerAccount, LedgerTxn } from "@/lib/finance/ledger";
import type { Facts, GoalRecord, Preferences } from "@/lib/finance/plan";
import { type Db, schema } from "../db/client";

export const LEDGER_DAYS = 400;

export type AccountRow = typeof schema.accounts.$inferSelect;
export type TxnRow = typeof schema.transactions.$inferSelect;

export function toLedgerAccount(a: AccountRow): LedgerAccount {
  return {
    id: a.id,
    name: a.name,
    type: a.type as AccountType,
    subtype: a.subtype,
    currency: a.currency,
    current: a.currentMinor,
    available: a.availableMinor,
    limit: a.limitMinor,
    balanceAsOf: a.balanceAsOf ? a.balanceAsOf.toISOString() : null,
    aprBps: a.aprBps,
    minPayment: a.minPaymentMinor,
    statementBalance: a.statementBalanceMinor,
    nextPaymentDue: a.nextPaymentDue,
    hidden: a.hidden || a.closed,
    manual: a.source !== "plaid",
  };
}

export function toLedgerTxn(t: TxnRow, splits?: { amountMinor: number; category: string; kind: string }[]): LedgerTxn {
  return {
    id: t.id,
    accountId: t.accountId,
    date: t.date,
    amount: t.amountMinor,
    kind: t.kind as TransactionKind,
    category: (toCategoryId(t.category) ?? "general") as CategoryId,
    merchant: t.merchant,
    merchantKey: t.merchantKey,
    pending: t.pending,
    splits: splits?.length
      ? splits.map((s) => ({ amount: s.amountMinor, category: (toCategoryId(s.category) ?? "general") as CategoryId, kind: s.kind as TransactionKind }))
      : undefined,
  };
}

const MONEY_FACTS: FactKey[] = [
  "retirement_spending_annual",
  "outside_investments",
  "workplace_contribution_monthly",
  "social_security_annual",
  "home_price",
  "travel_budget_annual",
  "child_cost_monthly",
];

export function toFacts(rows: { key: string; value: unknown }[]): Facts {
  const f: Facts = { skipped: [] };
  for (const r of rows) {
    const v = r.value as { value?: number; skipped?: boolean };
    const key = r.key as FactKey;
    if (v?.skipped) {
      f.skipped!.push(key);
      continue;
    }
    if (typeof v?.value !== "number") continue;
    if (MONEY_FACTS.includes(key)) {
      const map: Partial<Record<FactKey, keyof Facts>> = {
        retirement_spending_annual: "retirementSpendingAnnual",
        outside_investments: "outsideInvestments",
        workplace_contribution_monthly: "workplaceContributionMonthly",
        social_security_annual: "socialSecurityAnnual",
        home_price: "homePrice",
        travel_budget_annual: "travelBudgetAnnual",
        child_cost_monthly: "childCostMonthly",
      };
      (f as Record<string, unknown>)[map[key]!] = Math.round(v.value);
    } else if (key === "birth_year") f.birthYear = v.value;
    else if (key === "children_planned") f.childrenPlannedInYears = v.value;
    else if (key === "emergency_months") f.emergencyMonths = v.value;
  }
  return f;
}

export function toGoalRecord(g: typeof schema.goals.$inferSelect): GoalRecord {
  return {
    id: g.id,
    kind: g.kind as GoalKind,
    title: g.title,
    priority: g.priority,
    interpretation: g.interpretation as GoalInterpretation,
    targetMinor: g.targetMinor,
    targetDate: g.targetDate,
  };
}

export interface UserData {
  user: typeof schema.users.$inferSelect;
  asOf: string;
  accounts: AccountRow[];
  ledgerAccounts: LedgerAccount[];
  txns: LedgerTxn[];
  otherCurrencyTxns: number;
  reviewCount: number;
  goals: GoalRecord[];
  facts: Facts;
  prefs: Preferences;
  budget: BudgetItem[] | null;
  budgetVersion: number | null;
  ignoredRecurring: Set<string>;
}

/** Everything the finance engines need for one user, scoped by user id in every query. */
export async function loadUserData(db: Db, userId: string, now = new Date()): Promise<UserData> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) throw new Error("User not found");
  const asOf = todayISO(user.timezone, now);
  const since = addDays(asOf, -LEDGER_DAYS);

  const [accounts, txnRows, goalRows, factRows, prefRows, budgetRows, ignored] = await Promise.all([
    db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId)),
    db
      .select()
      .from(schema.transactions)
      .where(and(eq(schema.transactions.userId, userId), isNull(schema.transactions.removedAt), gte(schema.transactions.date, since))),
    db
      .select()
      .from(schema.goals)
      .where(and(eq(schema.goals.userId, userId), eq(schema.goals.status, "active")))
      .orderBy(schema.goals.priority, schema.goals.createdAt),
    db.select().from(schema.facts).where(eq(schema.facts.userId, userId)),
    db.select().from(schema.preferences).where(eq(schema.preferences.userId, userId)),
    db
      .select()
      .from(schema.budgets)
      .where(and(eq(schema.budgets.userId, userId), eq(schema.budgets.status, "active")))
      .orderBy(desc(schema.budgets.version))
      .limit(1),
    db
      .select({ key: schema.recurring.key })
      .from(schema.recurring)
      .where(and(eq(schema.recurring.userId, userId), eq(schema.recurring.status, "ignored"))),
  ]);

  const splitIds = txnRows.filter((t) => t.hasSplits).map((t) => t.id);
  const splitRows = splitIds.length
    ? await db.select().from(schema.splits).where(and(eq(schema.splits.userId, userId), inArray(schema.splits.transactionId, splitIds)))
    : [];
  const splitsBy = new Map<string, typeof splitRows>();
  for (const s of splitRows) splitsBy.set(s.transactionId, [...(splitsBy.get(s.transactionId) ?? []), s]);

  const inCurrency = txnRows.filter((t) => t.currency === user.currency);
  const p = prefRows[0];
  return {
    user,
    asOf,
    accounts,
    ledgerAccounts: accounts.filter((a) => a.currency === user.currency).map(toLedgerAccount),
    txns: inCurrency.map((t) => toLedgerTxn(t, splitsBy.get(t.id))),
    otherCurrencyTxns: txnRows.length - inCurrency.length,
    reviewCount: inCurrency.filter((t) => t.needsReview).length,
    goals: goalRows.map(toGoalRecord),
    facts: toFacts(factRows),
    prefs: {
      lifestyleWeight: p?.lifestyleWeight ?? 50,
      protectedCategories: (p?.protectedCategories ?? []) as CategoryId[],
      bufferMinor: p?.bufferMinor ?? null,
      committedSavingsMonthly: p?.committedSavingsMinor ?? 0,
    },
    budget: budgetRows[0] ? (budgetRows[0].items as BudgetItem[]) : null,
    budgetVersion: budgetRows[0]?.version ?? null,
    ignoredRecurring: new Set(ignored.map((r) => r.key)),
  };
}
