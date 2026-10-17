import { CATEGORIES, type CategoryId, category, countsAsIncome, countsAsSpending } from "./categories";
import { DAYS_PER_MONTH, completeMonthsBefore, daysBetween, type ISODate, monthKey } from "./dates";
import { type LedgerTxn, lines } from "./ledger";
import { median, type Minor } from "./money";
import { MONTHLY_FACTOR, type RecurringSeries } from "./recurring";

/**
 * Historical baseline: what a typical month looks like. Robust to one-off
 * months (median for regular categories) while still accounting for lumpy
 * spending (mean for irregular categories such as travel or taxes).
 */
export interface CategoryBaseline {
  category: CategoryId;
  monthly: Minor; // typical monthly spending, positive
  months: Minor[]; // per complete month, oldest first
  group: "essential" | "discretionary";
  irregular: boolean;
  trend: Minor; // last complete month minus baseline
}

export interface Baseline {
  monthsAnalyzed: number;
  months: string[];
  historyDays: number;
  coverage: "none" | "partial" | "good";
  spending: Minor; // monthly, positive
  essential: Minor;
  discretionary: Minor;
  income: Minor; // monthly
  incomeSource: "recurring" | "history" | "none";
  incomeVariability: number; // coefficient of variation of monthly income
  savingsCapacity: Minor; // income - spending
  savingsRate: number | null;
  categories: CategoryBaseline[];
  monthlyTotals: { month: string; income: Minor; spending: Minor }[];
}

export function monthlySpendByCategory(txns: LedgerTxn[]): Map<string, Map<CategoryId, Minor>> {
  const out = new Map<string, Map<CategoryId, Minor>>();
  for (const t of txns) {
    if (t.pending) continue;
    for (const l of lines(t)) {
      if (!countsAsSpending(l.kind)) continue;
      const m = monthKey(t.date);
      let cats = out.get(m);
      if (!cats) out.set(m, (cats = new Map()));
      // Outflows are negative; spending is reported positive, refunds reduce it.
      cats.set(l.category, (cats.get(l.category) ?? 0) - l.amount);
    }
  }
  return out;
}

export function monthlyIncome(txns: LedgerTxn[]): Map<string, Minor> {
  const out = new Map<string, Minor>();
  for (const t of txns) {
    if (t.pending) continue;
    for (const l of lines(t)) {
      if (!countsAsIncome(l.kind)) continue;
      const m = monthKey(t.date);
      out.set(m, (out.get(m) ?? 0) + l.amount);
    }
  }
  return out;
}

export function computeBaseline(txns: LedgerTxn[], series: RecurringSeries[], asOf: ISODate, maxMonths = 6): Baseline {
  const posted = txns.filter((t) => !t.pending);
  const earliest = posted.reduce<ISODate | null>((min, t) => (!min || t.date < min ? t.date : min), null);
  const historyDays = earliest ? daysBetween(earliest, asOf) : 0;

  // Only months fully covered by history count as complete.
  // A month is complete only if history began on or before its first day (3 days of slack).
  const complete = earliest
    ? completeMonthsBefore(asOf, maxMonths).filter((m) => daysBetween(earliest, `${m}-01`) >= -3)
    : [];

  const spendByMonth = monthlySpendByCategory(posted);
  const incomeByMonth = monthlyIncome(posted);

  let categories: CategoryBaseline[] = [];
  let monthsAnalyzed = complete.length;
  let monthlyTotals = complete.map((m) => ({
    month: m,
    income: incomeByMonth.get(m) ?? 0,
    spending: [...(spendByMonth.get(m)?.values() ?? [])].reduce((a, b) => a + b, 0),
  }));

  if (complete.length >= 1) {
    for (const def of CATEGORIES) {
      if (def.group !== "essential" && def.group !== "discretionary") continue;
      const id = def.id as CategoryId;
      const vals = complete.map((m) => Math.max(0, spendByMonth.get(m)?.get(id) ?? 0));
      if (vals.every((v) => v === 0)) continue;
      const irregular = Boolean((def as { irregular?: boolean }).irregular);
      const monthly = irregular ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : median(vals);
      categories.push({ category: id, monthly, months: vals, group: def.group, irregular, trend: vals.at(-1)! - monthly });
    }
  } else if (historyDays >= 14) {
    // Less than a month of history: pro-rate what we have, flagged as partial.
    monthsAnalyzed = 0;
    const scale = DAYS_PER_MONTH / historyDays;
    const totals = new Map<CategoryId, Minor>();
    for (const cats of spendByMonth.values()) for (const [c, v] of cats) totals.set(c, (totals.get(c) ?? 0) + v);
    categories = [...totals].filter(([, v]) => v > 0).map(([c, v]) => {
      const def = category(c);
      return {
        category: c,
        monthly: Math.round(v * scale),
        months: [],
        group: def.group === "essential" ? "essential" : "discretionary",
        irregular: Boolean(def.irregular),
        trend: 0,
      };
    });
    const inc = [...incomeByMonth.values()].reduce((a, b) => a + b, 0);
    monthlyTotals = [{ month: monthKey(asOf), income: Math.round(inc * scale), spending: categories.reduce((a, c) => a + c.monthly, 0) }];
  }
  categories.sort((a, b) => b.monthly - a.monthly);

  const spending = categories.reduce((a, c) => a + c.monthly, 0);
  const essential = categories.filter((c) => c.group === "essential").reduce((a, c) => a + c.monthly, 0);

  // Income: prefer detected recurring income (predictable), else historical mean.
  const recurringIncome = series
    .filter((s) => s.kind === "income" && s.active && s.confidence >= 0.5)
    .reduce((a, s) => a + Math.round(s.amount * MONTHLY_FACTOR[s.cadence]), 0);
  const histIncomes = monthlyTotals.map((m) => m.income);
  const histMean = histIncomes.length ? Math.round(histIncomes.reduce((a, b) => a + b, 0) / histIncomes.length) : 0;
  let income = 0;
  let incomeSource: Baseline["incomeSource"] = "none";
  if (recurringIncome > 0) {
    // Recurring paychecks plus any steady extra income seen historically.
    income = Math.max(recurringIncome, Math.min(histMean, Math.round(recurringIncome * 1.15)));
    incomeSource = "recurring";
  } else if (histMean > 0) {
    income = histMean;
    incomeSource = "history";
  }
  const mean = histIncomes.length ? histIncomes.reduce((a, b) => a + b, 0) / histIncomes.length : 0;
  const sd = histIncomes.length > 1 ? Math.sqrt(histIncomes.reduce((a, b) => a + (b - mean) ** 2, 0) / (histIncomes.length - 1)) : 0;

  const coverage: Baseline["coverage"] = complete.length >= 3 ? "good" : historyDays >= 14 ? "partial" : "none";
  const savingsCapacity = income - spending;
  return {
    monthsAnalyzed,
    months: complete,
    historyDays,
    coverage,
    spending,
    essential,
    discretionary: spending - essential,
    income,
    incomeSource,
    incomeVariability: mean > 0 ? Math.round((sd / mean) * 1000) / 1000 : 0,
    savingsCapacity,
    savingsRate: income > 0 ? Math.round((savingsCapacity / income) * 1000) / 1000 : null,
    categories,
    monthlyTotals,
  };
}

/** Spending so far this month by category (positive), for budget pacing. */
export function monthToDate(txns: LedgerTxn[], asOf: ISODate): { total: Minor; byCategory: Map<CategoryId, Minor>; income: Minor } {
  const m = monthKey(asOf);
  const byCategory = new Map<CategoryId, Minor>();
  let total = 0;
  let income = 0;
  for (const t of txns) {
    if (monthKey(t.date) !== m || t.date > asOf) continue;
    for (const l of lines(t)) {
      if (countsAsSpending(l.kind)) {
        byCategory.set(l.category, (byCategory.get(l.category) ?? 0) - l.amount);
        total -= l.amount;
      } else if (countsAsIncome(l.kind) && !t.pending) income += l.amount;
    }
  }
  return { total, byCategory, income };
}
