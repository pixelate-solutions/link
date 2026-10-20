import type { Baseline } from "./analysis";
import { type CategoryId, category } from "./categories";
import { daysInMonth, type ISODate } from "./dates";
import type { Minor } from "./money";

export interface BudgetItem {
  category: CategoryId;
  monthly: Minor;
  group: "essential" | "discretionary";
  locked?: boolean; // set explicitly by the user: never changed automatically
}

export interface BudgetLine extends BudgetItem {
  spent: Minor;
  expectedByNow: Minor;
  status: "under" | "on_pace" | "over_pace" | "over";
}

const roundUp = (m: Minor, step = 10_00) => Math.ceil(m / step) * step;

/** Initial budget = what a typical month actually costs, rounded. Descriptive, not aspirational. */
export function autoBudget(baseline: Baseline): BudgetItem[] {
  return baseline.categories
    .filter((c) => c.monthly >= 5_00)
    .map((c) => ({ category: c.category, monthly: roundUp(c.monthly), group: c.group }));
}

export function budgetStatus(items: BudgetItem[], spentByCategory: Map<CategoryId, Minor>, asOf: ISODate): BudgetLine[] {
  const day = Number(asOf.slice(8, 10));
  const frac = day / daysInMonth(asOf);
  return items
    .map((it) => {
      const spent = Math.max(0, spentByCategory.get(it.category) ?? 0);
      // Irregular categories are not paced linearly.
      const expectedByNow = category(it.category).irregular ? it.monthly : Math.round(it.monthly * frac);
      const status: BudgetLine["status"] =
        spent > it.monthly ? "over" : spent > expectedByNow * 1.15 + 10_00 ? "over_pace" : spent >= expectedByNow * 0.85 ? "on_pace" : "under";
      return { ...it, spent, expectedByNow, status };
    })
    .sort((a, b) => b.monthly - a.monthly);
}

/**
 * When income falls short, trim discretionary allowances proportionally,
 * never touching essentials, locked items or protected categories.
 */
export function adjustForIncome(items: BudgetItem[], shortfall: Minor, protectedCats: CategoryId[]): { items: BudgetItem[]; covered: Minor } {
  const flexible = items.filter((i) => i.group === "discretionary" && !i.locked && !protectedCats.includes(i.category));
  const pool = flexible.reduce((s, i) => s + i.monthly, 0);
  if (pool <= 0 || shortfall <= 0) return { items, covered: 0 };
  const cut = Math.min(shortfall, Math.round(pool * 0.5)); // never cut flexible spending by more than half
  const ratio = 1 - cut / pool;
  return {
    items: items.map((i) => (flexible.includes(i) ? { ...i, monthly: roundUp(Math.round(i.monthly * ratio), 5_00) } : i)),
    covered: cut,
  };
}

export interface SpendingSummary {
  planned: Minor;
  spent: Minor;
  /** Negative = over plan. */
  left: Minor;
  daysLeft: number;
  /** What's left per remaining day; 0 when nothing is left. */
  perDay: Minor;
  /** Where a typical month of yours is by today, capped at the plan. */
  pace: Minor;
  status: "on_track" | "spending_fast" | "over_plan";
  /** Up to three categories over plan, or flexible ones running ahead, with how far. */
  hot: { category: CategoryId; status: "over" | "over_pace"; amount: Minor }[];
}

/** The lead number on Home: this month's spending against the plan, and how it's pacing. */
export function spendingSummary(b: { lines: BudgetLine[]; spentThisMonth: Minor; plannedThisMonth: Minor; typicalByNow: Minor }, asOf: ISODate): SpendingSummary {
  const planned = b.plannedThisMonth;
  const spent = Math.max(0, b.spentThisMonth);
  const left = planned - spent;
  const daysLeft = daysInMonth(asOf) - Number(asOf.slice(8, 10)) + 1;
  // Rent and other early-month bills are included in a typical month, so paying them isn't "fast".
  const pace = Math.min(planned, b.typicalByNow);
  const ahead = spent > pace * 1.08 + 25_00;
  // Fixed bills land on their own schedule; only flexible categories can run "ahead".
  const hot = b.lines
    .filter((l) => l.status === "over" || (l.status === "over_pace" && l.group === "discretionary"))
    .slice(0, 3)
    .map((l) => ({ category: l.category, status: l.status as "over" | "over_pace", amount: Math.max(0, l.spent - (l.status === "over" ? l.monthly : l.expectedByNow)) }));
  return { planned, spent, left, daysLeft, perDay: left > 0 ? Math.floor(left / daysLeft) : 0, pace, status: left < 0 ? "over_plan" : ahead ? "spending_fast" : "on_track", hot };
}

