import type { CategoryId, TransactionKind } from "./categories";
import { addDays, addMonths, daysBetween, type ISODate } from "./dates";
import type { LedgerTxn } from "./ledger";
import { median, type Minor } from "./money";

export type Cadence = "weekly" | "biweekly" | "semimonthly" | "monthly" | "quarterly" | "semiannual" | "annual";
export type RecurringKind = "income" | "bill" | "subscription" | "transfer" | "savings" | "card_payment";

export interface RecurringSeries {
  key: string;
  merchant: string;
  merchantKey: string;
  kind: RecurringKind;
  category: CategoryId;
  cadence: Cadence;
  amount: Minor; // typical signed amount
  variability: number; // (max-min)/|median| over recent occurrences
  firstDate: ISODate;
  lastDate: ISODate;
  nextDate: ISODate | null;
  occurrences: number;
  confidence: number;
  accountId: string;
  /** Moves money between the user's own spendable accounts (net zero for cash). */
  internal: boolean;
  active: boolean;
  transactionIds: string[];
}

const CADENCES: { cadence: Cadence; days: number; tol: number }[] = [
  { cadence: "weekly", days: 7, tol: 1.5 },
  { cadence: "biweekly", days: 14, tol: 2.5 },
  { cadence: "semimonthly", days: 15.2, tol: 3 },
  { cadence: "monthly", days: 30.4, tol: 4.5 },
  { cadence: "quarterly", days: 91, tol: 9 },
  { cadence: "semiannual", days: 182, tol: 14 },
  { cadence: "annual", days: 365, tol: 20 },
];

export const MONTHLY_FACTOR: Record<Cadence, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  semimonthly: 2,
  monthly: 1,
  quarterly: 1 / 3,
  semiannual: 1 / 6,
  annual: 1 / 12,
};

export function cadenceDays(c: Cadence): number {
  return CADENCES.find((x) => x.cadence === c)!.days;
}

/**
 * How much the amount may vary and still be a "recurring" commitment. Variable
 * shopping at the same store on a regular day is a habit, not a bill.
 */
const BILL_LIKE = new Set<CategoryId>(["housing", "utilities", "insurance", "childcare", "debt_interest", "taxes", "fees", "subscriptions", "services", "healthcare"]);

function maxVariability(kind: TransactionKind, cat: CategoryId): number {
  if (kind !== "expense" && kind !== "fee") return 0.6;
  return BILL_LIKE.has(cat) ? 0.6 : 0.12;
}

const ELIGIBLE: Set<TransactionKind> = new Set(["income", "expense", "loan_payment", "transfer", "investment_transfer", "card_payment", "fee"]);

/** Split one merchant's transactions into clusters of similar amounts. */
function amountClusters(txns: LedgerTxn[]): LedgerTxn[][] {
  const sorted = [...txns].sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
  const clusters: LedgerTxn[][] = [];
  for (const t of sorted) {
    const c = clusters.find((cl) => {
      const ref = Math.abs(median(cl.map((x) => x.amount)));
      const a = Math.abs(t.amount);
      return Math.abs(a - ref) <= Math.max(ref * 0.2, 5_00);
    });
    if (c) c.push(t);
    else clusters.push([t]);
  }
  return clusters;
}

function classifyCadence(intervals: number[]): { cadence: Cadence; regularity: number } | null {
  if (!intervals.length) return null;
  const med = median(intervals);
  let best: { cadence: Cadence; regularity: number } | null = null;
  for (const c of CADENCES) {
    if (Math.abs(med - c.days) > c.tol * 1.5) continue;
    const within = intervals.filter((i) => Math.abs(i - c.days) <= c.tol).length / intervals.length;
    if (!best || within > best.regularity) best = { cadence: c.cadence, regularity: within };
  }
  return best;
}

function nextOccurrence(last: ISODate, cadence: Cadence, anchorDay: number): ISODate {
  switch (cadence) {
    case "monthly":
      return addMonths(last, 1, anchorDay);
    case "quarterly":
      return addMonths(last, 3, anchorDay);
    case "semiannual":
      return addMonths(last, 6, anchorDay);
    case "annual":
      return addMonths(last, 12, anchorDay);
    default:
      return addDays(last, Math.round(cadenceDays(cadence)));
  }
}

function seriesKind(kind: TransactionKind, category: CategoryId, amount: Minor, variability: number, transferTo?: LedgerTxn["transferTo"]): RecurringKind {
  if (kind === "income") return "income";
  if (kind === "card_payment") return "card_payment";
  if (kind === "investment_transfer") return "savings";
  // Only money moving to savings or investments is saving; checking-to-checking is just a move.
  if (kind === "transfer") return amount < 0 && transferTo !== "spendable" ? "savings" : "transfer";
  if (category === "subscriptions" || (variability < 0.05 && Math.abs(amount) <= 100_00 && category !== "utilities")) {
    return "subscription";
  }
  return "bill";
}

/**
 * Detect recurring income, bills, subscriptions and transfers. Uses posted,
 * non-split transactions grouped by merchant and amount band; requires three
 * occurrences (two for annual) with a consistent interval.
 */
export function detectRecurring(txns: LedgerTxn[], asOf: ISODate): RecurringSeries[] {
  const groups = new Map<string, LedgerTxn[]>();
  for (const t of txns) {
    if (t.pending || !ELIGIBLE.has(t.kind) || t.amount === 0) continue;
    const dir = t.amount > 0 ? "in" : "out";
    const key = `${t.merchantKey}|${dir}|${t.accountId}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(t);
  }

  const out: RecurringSeries[] = [];
  for (const [groupKey, group] of groups) {
    if (group.length < 2) continue;
    for (const cluster of amountClusters(group)) {
      const byDate = [...cluster].sort((a, b) => a.date.localeCompare(b.date));
      // Collapse same-day duplicates (e.g. two identical charges) into one occurrence.
      const dates = [...new Set(byDate.map((t) => t.date))];
      const intervals = dates.slice(1).map((d, i) => daysBetween(dates[i]!, d));
      const cad = classifyCadence(intervals);
      if (!cad) continue;
      const minCount = cad.cadence === "annual" || cad.cadence === "semiannual" ? 2 : 3;
      if (dates.length < minCount || cad.regularity < 0.6) continue;

      const recent = byDate.slice(-4);
      const amount = median(recent.map((t) => t.amount));
      const absAmts = recent.map((t) => Math.abs(t.amount));
      const variability = Math.abs(amount) ? (Math.max(...absAmts) - Math.min(...absAmts)) / Math.abs(amount) : 0;
      const last = dates.at(-1)!;
      const anchorDay = Number(median(dates.slice(-3).map((d) => Number(d.slice(8, 10)))));
      const next = nextOccurrence(last, cad.cadence, anchorDay);
      const gracePeriod = cadenceDays(cad.cadence) * 0.6 + 5;
      const active = daysBetween(next, asOf) <= gracePeriod;
      const head = byDate.at(-1)!;
      if (variability > maxVariability(head.kind, head.category)) continue;
      const kind = seriesKind(head.kind, head.category, amount, variability, head.transferTo);
      const countScore = Math.min(1, dates.length / 6);
      const stability = Math.max(0, 1 - variability);
      const confidence = Math.round((0.45 * cad.regularity + 0.3 * countScore + 0.25 * stability) * 100) / 100;
      const band = Math.round(Math.log2(Math.max(Math.abs(amount), 100)));

      out.push({
        key: `${groupKey}|${band}`,
        merchant: head.merchant,
        merchantKey: head.merchantKey,
        kind,
        category: head.category,
        cadence: cad.cadence,
        amount,
        variability: Math.round(variability * 1000) / 1000,
        firstDate: dates[0]!,
        lastDate: last,
        nextDate: active ? next : null,
        occurrences: dates.length,
        confidence,
        accountId: head.accountId,
        internal: head.transferTo === "spendable" && byDate.every((t) => t.transferTo === "spendable"),
        active,
        transactionIds: byDate.map((t) => t.id),
      });
    }
  }
  return out.sort((a, b) => Math.abs(b.amount) * MONTHLY_FACTOR[b.cadence] - Math.abs(a.amount) * MONTHLY_FACTOR[a.cadence]);
}

/** Expand active series into dated events within [from, to]. */
export function projectEvents(series: RecurringSeries[], from: ISODate, to: ISODate) {
  const events: { date: ISODate; amount: Minor; series: RecurringSeries; overdue?: boolean }[] = [];
  for (const s of series) {
    if (!s.active || !s.nextDate) continue;
    const anchor = Number(s.lastDate.slice(8, 10));
    let d = s.nextDate;
    // An occurrence that is a few days late has probably not happened yet: keep it, due now.
    if (d < from && daysBetween(d, from) <= 5) {
      events.push({ date: from, amount: s.amount, series: s, overdue: true });
      d = nextOccurrence(d, s.cadence, anchor);
    }
    let guard = 0;
    while (d < from && guard++ < 400) d = nextOccurrence(d, s.cadence, anchor);
    while (d <= to && guard++ < 800) {
      events.push({ date: d, amount: s.amount, series: s });
      d = nextOccurrence(d, s.cadence, anchor);
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}
