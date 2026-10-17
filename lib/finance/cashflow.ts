import { countsAsSpending } from "./categories";
import { addDays, addMonths, DAYS_PER_MONTH, daysBetween, type ISODate } from "./dates";
import { isSpendable, type LedgerAccount, type LedgerTxn, lines } from "./ledger";
import { type Minor, median } from "./money";
import { projectEvents, type RecurringSeries } from "./recurring";

/**
 * Cash model for the user's spendable (checking-type) accounts. One model
 * feeds the forecast, Safe to Spend, and every answer about upcoming cash,
 * so they can never disagree.
 */
export interface CashEvent {
  date: ISODate;
  amount: Minor;
  label: string;
  kind: "income" | "bill" | "subscription" | "savings" | "transfer" | "card";
  confirmed: boolean; // true = scheduled by the provider/user, false = predicted from history
  confidence: number;
  overdue?: boolean;
}

export interface CashModel {
  asOf: ISODate;
  cash: Minor;
  cashAsOf: string | null; // oldest balance timestamp among spendable accounts
  spendableAccountIds: string[];
  pendingOutflows: Minor; // already deducted when providers report available balance
  usedAvailable: boolean;
  variableDaily: Minor; // non-recurring spending from spendable accounts per day
  variableDailySd: Minor;
  cardMonthly: Map<string, Minor>; // card id -> typical monthly card spending
  series: RecurringSeries[];
  cards: LedgerAccount[];
}

export function buildCashModel(input: {
  accounts: LedgerAccount[];
  txns: LedgerTxn[];
  series: RecurringSeries[];
  asOf: ISODate;
  lookbackDays?: number;
}): CashModel {
  const { accounts, txns, series, asOf } = input;
  const spendable = accounts.filter((a) => isSpendable(a) && !a.hidden && (a.available != null || a.current != null));
  const ids = new Set(spendable.map((a) => a.id));
  const pendingOutflows = txns
    .filter((t) => t.pending && ids.has(t.accountId) && t.amount < 0)
    .reduce((s, t) => s - t.amount, 0);
  const usedAvailable = spendable.every((a) => a.available != null);
  // Available balance already nets pending debits; current balance does not.
  const cash = spendable.reduce((s, a) => s + (a.available ?? a.current ?? 0), 0) - (usedAvailable ? 0 : pendingOutflows);
  const stamps = spendable.map((a) => a.balanceAsOf).filter((x): x is string => Boolean(x));
  const cashAsOf = stamps.length ? stamps.sort()[0]! : null;

  // Variable (non-recurring) spending from spendable accounts.
  const lookback = input.lookbackDays ?? 90;
  const from = addDays(asOf, -lookback);
  const recurringIds = new Set(series.flatMap((s) => s.transactionIds));
  const earliest = txns.reduce<ISODate | null>((m, t) => (!m || t.date < m ? t.date : m), null);
  const windowDays = Math.max(1, Math.min(lookback, earliest ? daysBetween(earliest, asOf) : lookback));
  const weekly = new Map<number, Minor>();
  let variable = 0;
  for (const t of txns) {
    if (t.pending || t.date < from || t.date > asOf || !ids.has(t.accountId) || recurringIds.has(t.id)) continue;
    for (const l of lines(t)) {
      if (!countsAsSpending(l.kind)) continue;
      variable -= l.amount;
      const w = Math.floor(daysBetween(from, t.date) / 7);
      weekly.set(w, (weekly.get(w) ?? 0) - l.amount);
    }
  }
  const weeks = Math.max(1, Math.floor(windowDays / 7));
  const weeklyVals = Array.from({ length: weeks }, (_, i) => weekly.get(i) ?? 0);
  const wMean = weeklyVals.reduce((a, b) => a + b, 0) / weeks;
  const wSd = weeks > 1 ? Math.sqrt(weeklyVals.reduce((a, b) => a + (b - wMean) ** 2, 0) / (weeks - 1)) : wMean * 0.5;

  const cards = accounts.filter((a) => a.type === "credit" && !a.hidden);
  const cardMonthly = new Map<string, Minor>();
  for (const c of cards) {
    let spent = 0;
    for (const t of txns) {
      if (t.accountId !== c.id || t.pending || t.date < from) continue;
      for (const l of lines(t)) if (countsAsSpending(l.kind)) spent -= l.amount;
    }
    cardMonthly.set(c.id, Math.max(0, Math.round((spent / windowDays) * DAYS_PER_MONTH)));
  }

  return {
    asOf,
    cash,
    cashAsOf,
    spendableAccountIds: [...ids],
    pendingOutflows,
    usedAvailable,
    variableDaily: Math.max(0, Math.round(variable / windowDays)),
    variableDailySd: Math.round(wSd / Math.sqrt(7)),
    cardMonthly,
    series,
    cards,
  };
}

/** Estimated due day for a card without liability data: median day-of-month of past payments. */
function cardDueDates(model: CashModel, card: LedgerAccount, to: ISODate, paymentDays: number[]): ISODate[] {
  const out: ISODate[] = [];
  let d: ISODate;
  if (card.nextPaymentDue) d = card.nextPaymentDue;
  else {
    const day = paymentDays.length ? median(paymentDays) : 25;
    d = `${model.asOf.slice(0, 8)}${String(Math.min(day, 28)).padStart(2, "0")}`;
    if (d < model.asOf) d = addMonths(d, 1, day);
  }
  while (d <= to) {
    if (d >= model.asOf) out.push(d);
    d = addMonths(d, 1);
  }
  return out;
}

/** Scheduled and predicted cash events for spendable accounts in [asOf, to]. */
export function cashEvents(model: CashModel, to: ISODate, cardPaymentDays: Map<string, number[]> = new Map()): CashEvent[] {
  const spendable = new Set(model.spendableAccountIds);
  const events: CashEvent[] = [];
  const relevant = model.series.filter((s) => spendable.has(s.accountId) && s.kind !== "card_payment");
  for (const e of projectEvents(relevant, model.asOf, to)) {
    const k = e.series.kind;
    events.push({
      date: e.date,
      amount: e.amount,
      label: e.series.merchant,
      kind: k === "income" ? "income" : k === "savings" ? "savings" : k === "transfer" ? "transfer" : k === "subscription" ? "subscription" : "bill",
      confirmed: false,
      confidence: e.series.confidence,
      overdue: e.overdue,
    });
  }
  for (const card of model.cards) {
    const owed = Math.max(0, card.current ?? 0);
    const dates = cardDueDates(model, card, to, cardPaymentDays.get(card.id) ?? []);
    dates.forEach((date, i) => {
      // First due date: what is owed now (statement balance if known). Later: typical monthly card spending.
      const amount = i === 0 ? (card.statementBalance ?? owed) : (model.cardMonthly.get(card.id) ?? 0);
      if (amount <= 0) return;
      events.push({
        date,
        amount: -amount,
        label: `${card.name} payment`,
        kind: "card",
        confirmed: i === 0 && Boolean(card.nextPaymentDue && card.statementBalance != null),
        confidence: i === 0 ? 0.9 : 0.6,
      });
    });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
}

export interface ForecastPoint {
  date: ISODate;
  expected: Minor;
  low: Minor;
  high: Minor;
}

export interface Forecast {
  days: number;
  points: ForecastPoint[];
  events: CashEvent[];
  lowest: { date: ISODate; expected: Minor; low: Minor };
  shortfall: { date: ISODate; amount: Minor } | null;
  endExpected: Minor;
}

export function forecastCash(model: CashModel, days: number, cardPaymentDays?: Map<string, number[]>, threshold: Minor = 0): Forecast {
  const to = addDays(model.asOf, days);
  const events = cashEvents(model, to, cardPaymentDays);
  const byDate = new Map<ISODate, CashEvent[]>();
  for (const e of events) {
    let arr = byDate.get(e.date);
    if (!arr) byDate.set(e.date, (arr = []));
    arr.push(e);
  }
  const points: ForecastPoint[] = [];
  let expected = model.cash;
  let uncertainIncome = 0;
  let shortfall: Forecast["shortfall"] = null;
  let lowest = { date: model.asOf, expected, low: expected };
  for (let i = 0; i <= days; i++) {
    const date = addDays(model.asOf, i);
    if (i > 0) expected -= model.variableDaily;
    for (const e of byDate.get(date) ?? []) {
      expected += e.amount;
      if (e.amount > 0 && e.confidence < 0.75) uncertainIncome += e.amount;
    }
    const spread = Math.round(1.28 * model.variableDailySd * Math.sqrt(i)); // ~80% band
    const low = expected - spread - uncertainIncome;
    const high = expected + spread;
    points.push({ date, expected, low, high });
    if (expected < lowest.expected) lowest = { date, expected, low };
    if (!shortfall && expected < threshold) shortfall = { date, amount: threshold - expected };
  }
  return { days, points, events, lowest, shortfall, endExpected: expected };
}

export type SafeToSpendStatus = "ok" | "estimate" | "stale" | "unavailable";

export interface SafeToSpend {
  status: SafeToSpendStatus;
  amount: Minor; // may be negative: a shortfall
  perDay: Minor;
  horizonEnd: ISODate;
  horizonDays: number;
  horizonReason: "next_income" | "no_income_detected";
  breakdown: { label: string; amount: Minor }[];
  limitations: string[];
  cashAsOf: string | null;
}

export const STALE_AFTER_HOURS = 36;

/**
 * Safe to Spend = spendable cash − obligations due before the next paycheck −
 * committed savings in that window − a minimum buffer. Expected income is not
 * counted: the window ends the day before it arrives.
 */
export function safeToSpend(input: {
  model: CashModel;
  essentialMonthly: Minor;
  bufferOverride?: Minor | null;
  committedSavingsMonthly?: Minor;
  now?: Date;
  cardPaymentDays?: Map<string, number[]>;
}): SafeToSpend {
  const { model } = input;
  const limitations: string[] = [];
  const now = input.now ?? new Date();

  if (!model.spendableAccountIds.length) {
    return {
      status: "unavailable",
      amount: 0,
      perDay: 0,
      horizonEnd: model.asOf,
      horizonDays: 0,
      horizonReason: "no_income_detected",
      breakdown: [],
      limitations: ["Connect a checking account to calculate this."],
      cashAsOf: null,
    };
  }

  const look = cashEvents(model, addDays(model.asOf, 35), input.cardPaymentDays);
  const nextIncome = look.find((e) => e.kind === "income" && e.amount > 0 && e.date > model.asOf);
  const horizonEnd = nextIncome ? addDays(nextIncome.date, -1) : addDays(model.asOf, 30);
  const horizonDays = Math.max(1, daysBetween(model.asOf, horizonEnd) + 1);
  if (!nextIncome) limitations.push("No regular income detected, so this covers the next 30 days.");

  const due = look.filter((e) => e.amount < 0 && e.date <= horizonEnd);
  const bills = due.filter((e) => e.kind !== "savings");
  const savingsScheduled = due.filter((e) => e.kind === "savings");
  const billsTotal = bills.reduce((s, e) => s - e.amount, 0);
  const savingsTotal = savingsScheduled.reduce((s, e) => s - e.amount, 0);
  // A savings commitment without a detected transfer is reserved pro-rata.
  const committed =
    savingsScheduled.length === 0 && input.committedSavingsMonthly
      ? Math.round((input.committedSavingsMonthly * horizonDays) / DAYS_PER_MONTH)
      : 0;
  const buffer =
    input.bufferOverride ?? Math.max(100_00, Math.round(((input.essentialMonthly / DAYS_PER_MONTH) * 7) / 10_00) * 10_00);

  const amount = model.cash - billsTotal - savingsTotal - committed - buffer;
  const breakdown = [
    { label: "Spendable cash", amount: model.cash },
    ...(model.usedAvailable || !model.pendingOutflows ? [] : [{ label: "Pending (deducted)", amount: -model.pendingOutflows }]),
    { label: "Bills before payday", amount: -billsTotal },
    ...(savingsTotal ? [{ label: "Scheduled savings", amount: -savingsTotal }] : []),
    ...(committed ? [{ label: "Savings you committed to", amount: -committed }] : []),
    { label: "Safety buffer", amount: -buffer },
  ];

  let status: SafeToSpendStatus = "ok";
  if (model.cashAsOf) {
    const ageHours = (now.getTime() - new Date(model.cashAsOf).getTime()) / 3_600_000;
    if (ageHours > STALE_AFTER_HOURS) {
      status = "stale";
      limitations.push("Balances haven't refreshed recently.");
    }
  }
  if (status === "ok" && (!nextIncome || bills.some((b) => b.confidence < 0.6))) status = "estimate";
  if (bills.some((b) => b.overdue)) limitations.push("A regular bill looks late; it's still counted.");

  return {
    status,
    amount,
    perDay: amount > 0 ? Math.floor(amount / horizonDays) : 0,
    horizonEnd,
    horizonDays,
    horizonReason: nextIncome ? "next_income" : "no_income_detected",
    breakdown,
    limitations,
    cashAsOf: model.cashAsOf,
  };
}
