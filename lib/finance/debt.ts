import type { Minor } from "./money";

export interface Debt {
  id: string;
  name: string;
  balance: Minor; // positive amount owed
  aprBps: number | null; // null = unknown; never invented
  minPayment: Minor | null;
  kind?: "card" | "mortgage" | "loan";
  /** For cards: false when the balance is just this cycle's charges, paid in full. */
  revolving?: boolean;
}

/** Debts that actually accrue interest month to month. */
export function interestBearing(d: Debt): boolean {
  return d.kind !== "card" || d.revolving !== false;
}

export interface Amortization {
  months: number | null; // null = never paid off at this payment
  totalInterest: Minor;
  schedule: { month: number; interest: Minor; principal: Minor; balance: Minor }[];
}

const MAX_MONTHS = 600;

/** Standard monthly amortization with interest rounded to the cent each month. */
export function amortize(balance: Minor, aprBps: number, payment: Minor, keepSchedule = false): Amortization {
  const r = aprBps / 10_000 / 12;
  let bal = balance;
  let totalInterest = 0;
  const schedule: Amortization["schedule"] = [];
  for (let m = 1; m <= MAX_MONTHS; m++) {
    const interest = Math.round(bal * r);
    if (payment <= interest && bal > 0) return { months: null, totalInterest: Infinity, schedule };
    const pay = Math.min(payment, bal + interest);
    const principal = pay - interest;
    bal -= principal;
    totalInterest += interest;
    if (keepSchedule) schedule.push({ month: m, interest, principal, balance: bal });
    if (bal <= 0) return { months: m, totalInterest, schedule };
  }
  return { months: null, totalInterest, schedule };
}

/** Payment needed to clear a balance in `months`. */
export function paymentFor(balance: Minor, aprBps: number, months: number): Minor {
  const r = aprBps / 10_000 / 12;
  if (r === 0) return Math.ceil(balance / months);
  return Math.ceil((balance * r) / (1 - (1 + r) ** -months));
}

export type PayoffStrategy = "avalanche" | "snowball";

export interface PayoffPlan {
  strategy: PayoffStrategy;
  months: number | null;
  totalInterest: Minor;
  order: { id: string; name: string; paidOffMonth: number | null }[];
  excluded: { id: string; name: string; reason: string }[];
}

/**
 * Simulate paying all debts with a fixed monthly budget: minimums everywhere,
 * the remainder to the target debt (highest APR for avalanche, smallest
 * balance for snowball), rolling freed-up payments forward.
 */
export function payoffPlan(debts: Debt[], monthlyBudget: Minor, strategy: PayoffStrategy): PayoffPlan {
  const excluded = debts
    .filter((d) => d.aprBps == null)
    .map((d) => ({ id: d.id, name: d.name, reason: "Interest rate unknown" }));
  const live = debts
    .filter((d) => d.aprBps != null && d.balance > 0)
    .map((d) => ({ ...d, aprBps: d.aprBps!, bal: d.balance, min: d.minPayment ?? Math.max(25_00, Math.round(d.balance * 0.02)), paidOff: null as number | null }));

  const order = () =>
    live
      .filter((d) => d.bal > 0)
      .sort((a, b) => (strategy === "avalanche" ? b.aprBps - a.aprBps || a.bal - b.bal : a.bal - b.bal || b.aprBps - a.aprBps));

  let totalInterest = 0;
  let month = 0;
  while (live.some((d) => d.bal > 0) && month < MAX_MONTHS) {
    month++;
    for (const d of live) {
      if (d.bal <= 0) continue;
      const interest = Math.round(d.bal * (d.aprBps / 10_000 / 12));
      d.bal += interest;
      totalInterest += interest;
    }
    let budget = monthlyBudget;
    for (const d of live) {
      if (d.bal <= 0) continue;
      const pay = Math.min(d.min, d.bal, budget);
      d.bal -= pay;
      budget -= pay;
    }
    for (const d of order()) {
      if (budget <= 0) break;
      const pay = Math.min(d.bal, budget);
      d.bal -= pay;
      budget -= pay;
    }
    for (const d of live) if (d.bal <= 0 && d.paidOff == null) d.paidOff = month;
    if (budget === monthlyBudget) break; // nothing could be paid
  }
  const done = live.every((d) => d.bal <= 0);
  return {
    strategy,
    months: done ? month : null,
    totalInterest,
    order: [...live].sort((a, b) => (a.paidOff ?? 1e9) - (b.paidOff ?? 1e9)).map((d) => ({ id: d.id, name: d.name, paidOffMonth: d.paidOff })),
    excluded,
  };
}

/** Avalanche vs snowball, funded by the known-rate debts' minimums plus `extra` each month. */
export function comparePayoff(debts: Debt[], extra: Minor) {
  const minimums = debts.filter((d) => d.aprBps != null).reduce((s, d) => s + (d.minPayment ?? Math.max(25_00, Math.round(d.balance * 0.02))), 0);
  const budget = minimums + extra;
  return { budget, plans: (["avalanche", "snowball"] as const).map((s) => payoffPlan(debts, budget, s)) };
}
