import { type CategoryId, countsAsSpending } from "./categories";
import { completeMonthsBefore, daysBetween, type ISODate, monthKey } from "./dates";
import { type LedgerAccount, type LedgerTxn, lines, netWorthValue } from "./ledger";
import type { Minor } from "./money";
import { detectRecurring, MONTHLY_FACTOR } from "./recurring";

/**
 * A business the user owns. Its accounts are excluded from the personal
 * picture; this engine summarizes them on their own terms.
 */
export interface BusinessRecord {
  id: string;
  name: string;
  structure: string;
  ownershipPct: number;
  countTowardGoals: boolean;
  taxSetAsidePct: number;
}

/**
 * Pass-through entities (sole proprietorships, LLCs, S corps, partnerships):
 * the owner's share of profit is taxed on their personal return whether or
 * not it is drawn. "other" is treated like a C corp that pays its own tax.
 */
export const PASS_THROUGH = new Set(["sole_prop", "llc", "s_corp", "partnership"]);

/** A sole proprietorship isn't separate from its owner: its money is theirs, opted in or not. */
export function isOwnersMoney(b: Pick<BusinessRecord, "structure" | "countTowardGoals">): boolean {
  return b.structure === "sole_prop" || b.countTowardGoals;
}

export interface BusinessMonth {
  month: string;
  revenue: Minor;
  expenses: Minor;
  profit: Minor;
  draws: Minor;
}

export interface BusinessView extends BusinessRecord {
  accountIds: string[];
  cash: Minor;
  debt: Minor;
  netWorth: Minor;
  ownerShare: Minor;
  monthsAnalyzed: number;
  months: BusinessMonth[];
  /** Typical month (mean of complete months: business income is lumpy). */
  revenue: Minor;
  expenses: Minor;
  profit: Minor;
  margin: number | null;
  draws: Minor;
  contributions: Minor;
  /** Months of expenses the cash covers when profitable; months until cash runs out when losing money. */
  runwayMonths: number | null;
  burning: boolean;
  thisMonth: { revenue: Minor; expenses: Minor; profit: Minor };
  topExpenses: { category: CategoryId; monthly: Minor }[];
  recurringCosts: { merchant: string; monthly: Minor; cadence: string }[];
  /** The user's share of typical monthly profit. Revenue isn't income; this is. */
  ownerProfit: Minor;
  passThrough: boolean;
  /** Estimated tax on the owner's share of profit. */
  taxSetAsideMonthly: Minor;
  /** The part of that tax the owner's personal money has to cover, because the profit was drawn out. */
  personalTaxMonthly: Minor;
  /** The owner's after-tax share of profit that stays in the business each month. */
  retainedMonthly: Minor;
}

function monthTotals(txns: LedgerTxn[], month: string) {
  let revenue = 0;
  let expenses = 0;
  let draws = 0;
  let contributions = 0;
  for (const t of txns) {
    if (t.pending || monthKey(t.date) !== month) continue;
    for (const l of lines(t)) {
      if (l.kind === "income") revenue += l.amount;
      else if (countsAsSpending(l.kind)) expenses -= l.amount;
      else if (l.kind === "owner_draw") draws -= l.amount;
      else if (l.kind === "owner_contribution") contributions += l.amount;
    }
  }
  return { revenue, expenses, draws, contributions };
}

export function computeBusiness(record: BusinessRecord, accounts: LedgerAccount[], txns: LedgerTxn[], asOf: ISODate): BusinessView {
  const accountIds = accounts.map((a) => a.id);
  const ids = new Set(accountIds);
  const ledger = txns.filter((t) => ids.has(t.accountId));
  const cash = accounts.filter((a) => a.type === "depository").reduce((s, a) => s + (a.available ?? a.current ?? 0), 0);
  const debt = accounts.filter((a) => a.type === "credit" || a.type === "loan").reduce((s, a) => s + Math.max(0, a.current ?? 0), 0);
  const netWorth = accounts.reduce((s, a) => s + netWorthValue(a), 0);

  const earliest = ledger.reduce<ISODate | null>((m, t) => (!m || t.date < m ? t.date : m), null);
  const complete = earliest ? completeMonthsBefore(asOf, 6).filter((m) => daysBetween(earliest, `${m}-01`) >= -3) : [];
  const months: BusinessMonth[] = complete.map((m) => {
    const x = monthTotals(ledger, m);
    return { month: m, revenue: x.revenue, expenses: x.expenses, profit: x.revenue - x.expenses, draws: x.draws };
  });
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const revenue = mean(months.map((m) => m.revenue));
  const expenses = mean(months.map((m) => m.expenses));
  const profit = revenue - expenses;
  const draws = mean(months.map((m) => m.draws));
  const contributions = mean(complete.map((m) => monthTotals(ledger, m).contributions));

  // Burn includes what the owner takes out: that cash leaves the business too.
  const netOutflow = expenses + draws - revenue - contributions;
  const burning = months.length > 0 && netOutflow > 0;
  const runwayMonths = !months.length ? null : burning ? Math.round((Math.max(0, cash) / netOutflow) * 10) / 10 : expenses > 0 ? Math.round((Math.max(0, cash) / expenses) * 10) / 10 : null;

  const byCategory = new Map<CategoryId, Minor>();
  for (const t of ledger) {
    if (t.pending || !complete.includes(monthKey(t.date))) continue;
    for (const l of lines(t)) if (countsAsSpending(l.kind)) byCategory.set(l.category, (byCategory.get(l.category) ?? 0) - l.amount);
  }
  const topExpenses = [...byCategory]
    .map(([category, total]) => ({ category, monthly: Math.round(total / Math.max(1, complete.length)) }))
    .filter((c) => c.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly)
    .slice(0, 5);

  const recurringCosts = detectRecurring(ledger, asOf)
    .filter((s) => s.active && s.amount < 0 && (s.kind === "bill" || s.kind === "subscription"))
    .map((s) => ({ merchant: s.merchant, monthly: Math.round(-s.amount * MONTHLY_FACTOR[s.cadence]), cadence: s.cadence }))
    .sort((a, b) => b.monthly - a.monthly)
    .slice(0, 8);

  const now = monthTotals(ledger, monthKey(asOf));
  return {
    ...record,
    accountIds,
    cash,
    debt,
    netWorth,
    ownerShare: Math.round((netWorth * record.ownershipPct) / 100),
    monthsAnalyzed: months.length,
    months,
    revenue,
    expenses,
    profit,
    margin: revenue > 0 ? Math.round((profit / revenue) * 1000) / 1000 : null,
    draws,
    contributions,
    runwayMonths,
    burning,
    thisMonth: { revenue: now.revenue, expenses: now.expenses, profit: now.revenue - now.expenses },
    topExpenses,
    recurringCosts,
    ...ownerEconomics(record, profit, draws),
  };
}

/**
 * What the business means for the owner personally. Draws already reach the
 * personal plan as income; tax on profit that was drawn out has to come from
 * personal money, while profit left in the business can pay its own tax.
 */
export function ownerEconomics(record: BusinessRecord, profit: Minor, draws: Minor) {
  const ownerProfit = Math.round((profit * record.ownershipPct) / 100);
  const passThrough = PASS_THROUGH.has(record.structure);
  const taxSetAsideMonthly = Math.max(0, Math.round((ownerProfit * record.taxSetAsidePct) / 100));
  const leftInBusiness = Math.max(0, ownerProfit - draws);
  const personalTaxMonthly = passThrough ? Math.max(0, taxSetAsideMonthly - leftInBusiness) : 0;
  const retainedMonthly = Math.max(0, ownerProfit - draws - (taxSetAsideMonthly - personalTaxMonthly));
  return { ownerProfit, passThrough, taxSetAsideMonthly, personalTaxMonthly, retainedMonthly };
}
