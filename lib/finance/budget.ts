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
