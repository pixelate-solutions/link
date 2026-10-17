import { describe, expect, it } from "vitest";
import { computeBaseline } from "@/lib/finance/analysis";
import { buildCashModel, safeToSpend } from "@/lib/finance/cashflow";
import type { CategoryId, TransactionKind } from "@/lib/finance/categories";
import { addDays } from "@/lib/finance/dates";
import { amortize, payoffPlan, paymentFor } from "@/lib/finance/debt";
import { monteCarloFi, projectFi, simulateFi, SCENARIOS } from "@/lib/finance/fi";
import { interpretGoals, parseAmount, parseTiming } from "@/lib/finance/goals";
import type { LedgerAccount, LedgerTxn } from "@/lib/finance/ledger";
import { detectRecurring } from "@/lib/finance/recurring";
import { shouldResurface } from "@/lib/finance/recommend";
import { matchTransfers } from "@/lib/finance/transfers";

let n = 0;
const tx = (p: Partial<LedgerTxn> & { date: string; amount: number }): LedgerTxn => ({
  id: `t${++n}`,
  accountId: "chk",
  kind: (p.amount > 0 ? "income" : "expense") as TransactionKind,
  category: (p.amount > 0 ? "paycheck" : "groceries") as CategoryId,
  merchant: "M",
  merchantKey: "m",
  pending: false,
  ...p,
});
const checking = (p: Partial<LedgerAccount> = {}): LedgerAccount => ({ id: "chk", name: "Checking", type: "depository", subtype: "checking", currency: "USD", current: 500_000, available: 500_000, balanceAsOf: "2026-10-15T12:00:00Z", ...p });

describe("transfers", () => {
  it("pairs equal and opposite legs across accounts within 5 days, and never pairs a refund with a purchase", () => {
    const m = matchTransfers([
      { id: "a", accountId: "chk", accountType: "depository", amount: -50000, date: "2026-10-01", kind: "transfer" },
      { id: "b", accountId: "sav", accountType: "depository", amount: 50000, date: "2026-10-03", kind: "transfer" },
      { id: "c", accountId: "chk", accountType: "depository", amount: -4000, date: "2026-10-01", kind: "expense" },
      { id: "d", accountId: "cc", accountType: "credit", amount: 4000, date: "2026-10-02", kind: "refund" },
      { id: "e", accountId: "chk", accountType: "depository", amount: -90000, date: "2026-10-01", kind: "transfer" },
      { id: "f", accountId: "sav", accountType: "depository", amount: 90000, date: "2026-10-09", kind: "transfer" },
    ]);
    expect(m.map((x) => [x.outflowId, x.inflowId])).toEqual([["a", "b"]]);
  });
  it("labels card payments and loan payments by the receiving account", () => {
    const [card] = matchTransfers([
      { id: "a", accountId: "chk", accountType: "depository", amount: -1000, date: "2026-10-01", kind: "expense" },
      { id: "b", accountId: "cc", accountType: "credit", amount: 1000, date: "2026-10-01", kind: "card_payment" },
    ]);
    expect(card!.outflowKind).toBe("card_payment");
    const [loan] = matchTransfers([
      { id: "a", accountId: "chk", accountType: "depository", amount: -205000, date: "2026-10-01", kind: "loan_payment" },
      { id: "b", accountId: "mort", accountType: "loan", accountSubtype: "mortgage", amount: 205000, date: "2026-10-01", kind: "transfer" },
    ]);
    expect([loan!.outflowKind, loan!.outflowCategory, loan!.inflowKind]).toEqual(["loan_payment", "housing", "transfer"]);
  });
});

describe("recurring detection", () => {
  it("detects monthly, biweekly and annual cadences and predicts the next date", () => {
    const txns = [
      ...[0, 1, 2, 3, 4].map((i) => tx({ date: addDays("2026-05-01", i * 14), amount: 200000, merchantKey: "pay", merchant: "Payroll" })),
      ...["2026-05-05", "2026-06-05", "2026-07-05", "2026-08-05"].map((d) => tx({ date: d, amount: -1599, merchantKey: "nf", merchant: "Netflix", category: "subscriptions" })),
      ...["2024-11-02", "2025-11-01"].map((d) => tx({ date: d, amount: -9900, merchantKey: "dom", merchant: "Domain", category: "services" })),
    ];
    const s = detectRecurring(txns, "2026-08-10");
    const by = (k: string) => s.find((x) => x.merchantKey === k)!;
    expect(by("pay").cadence).toBe("biweekly");
    expect(by("nf").cadence).toBe("monthly");
    expect(by("nf").nextDate).toBe("2026-09-05");
    expect(by("nf").kind).toBe("subscription");
    expect(by("dom").cadence).toBe("annual");
  });
  it("does not call variable shopping a bill, and ends series that stopped", () => {
    const groceries = [0, 1, 2, 3, 4, 5].map((i) => tx({ date: addDays("2026-05-02", i * 7), amount: -(8000 + i * 2500), merchantKey: "store" }));
    expect(detectRecurring(groceries, "2026-06-15")).toHaveLength(0);
    const stopped = ["2026-01-05", "2026-02-05", "2026-03-05"].map((d) => tx({ date: d, amount: -1000, merchantKey: "gym", category: "subscriptions" }));
    expect(detectRecurring(stopped, "2026-08-01")[0]!.active).toBe(false);
  });
});

describe("baseline", () => {
  it("handles no history, partial history and zero spending", () => {
    expect(computeBaseline([], [], "2026-10-15").coverage).toBe("none");
    const partial = computeBaseline([tx({ date: "2026-10-01", amount: -30000 }), tx({ date: "2026-10-10", amount: -30000 })], [], "2026-10-25");
    expect(partial.coverage).toBe("partial");
    expect(partial.spending).toBeGreaterThan(60000); // pro-rated to a month
    const incomeOnly = computeBaseline([0, 1, 2, 3].map((i) => tx({ date: addDays("2026-06-01", i * 30), amount: 100000 })), [], "2026-10-15");
    expect(incomeOnly.spending).toBe(0);
    expect(incomeOnly.savingsRate).toBe(1);
  });
  it("nets refunds against spending and ignores pending", () => {
    const b = computeBaseline(
      [tx({ date: "2026-07-01", amount: 1 }), tx({ date: "2026-08-03", amount: -10000, category: "shopping" }), tx({ date: "2026-08-04", amount: 4000, kind: "refund", category: "shopping" }), tx({ date: "2026-08-05", amount: -99999, pending: true })],
      [],
      "2026-09-02",
    );
    expect(b.monthlyTotals.find((m) => m.month === "2026-08")!.spending).toBe(6000);
  });
});

describe("safe to spend", () => {
  const now = new Date("2026-10-15T13:00:00Z");
  it("is unavailable without a checking account", () => {
    const model = buildCashModel({ accounts: [], txns: [], series: [], asOf: "2026-10-15" });
    expect(safeToSpend({ model, essentialMonthly: 0, now }).status).toBe("unavailable");
  });
  it("flags stale balances and missing income instead of manufacturing precision", () => {
    const model = buildCashModel({ accounts: [checking({ balanceAsOf: "2026-10-10T00:00:00Z" })], txns: [], series: [], asOf: "2026-10-15" });
    const s = safeToSpend({ model, essentialMonthly: 300000, now });
    expect(s.status).toBe("stale");
    expect(s.horizonReason).toBe("no_income_detected");
    expect(s.limitations.join(" ")).toMatch(/No regular income/);
  });
  it("can be negative when overdrawn, and deducts pending debits when only current balance is known", () => {
    const model = buildCashModel({
      accounts: [checking({ current: -5000, available: null })],
      txns: [tx({ date: "2026-10-14", amount: -2500, pending: true })],
      series: [],
      asOf: "2026-10-15",
    });
    const s = safeToSpend({ model, essentialMonthly: 0, now });
    expect(model.cash).toBe(-7500);
    expect(s.amount).toBeLessThan(0);
    expect(s.perDay).toBe(0);
  });
});

describe("debt", () => {
  it("amortizes to the cent and finds the required payment", () => {
    expect(paymentFor(1_000_000, 1200, 36)).toBe(33_215);
    const a = amortize(1_000_000, 1200, 33_215, true);
    expect(a.months).toBe(36);
    expect(a.schedule[0]!.interest).toBe(10_000);
    expect(a.schedule.at(-1)!.balance).toBe(0);
    expect(amortize(1_000_000, 2400, 10_000).months).toBeNull(); // payment below interest
  });
  it("avalanche never costs more interest than snowball; unknown rates are excluded, not guessed", () => {
    const debts = [
      { id: "a", name: "Card A", balance: 500_000, aprBps: 2499, minPayment: 15_000 },
      { id: "b", name: "Card B", balance: 100_000, aprBps: 1200, minPayment: 5_000 },
      { id: "c", name: "Loan", balance: 300_000, aprBps: null, minPayment: 10_000 },
    ];
    const av = payoffPlan(debts, 60_000, "avalanche");
    const sn = payoffPlan(debts, 60_000, "snowball");
    expect(av.totalInterest).toBeLessThanOrEqual(sn.totalInterest);
    expect(av.excluded.map((e) => e.id)).toEqual(["c"]);
    expect(sn.order[0]!.id).toBe("b");
  });
});

describe("financial independence", () => {
  const base = { currentAge: 35, investable: 10_000_000, retirementShare: 0.8, monthlyContribution: 200_000, annualSpending: 6_000_000 };
  it("orders scenarios and is reproducible", () => {
    const years = SCENARIOS.map((a) => simulateFi(base, a).months!);
    expect(years[0]).toBeGreaterThan(years[1]!);
    expect(years[1]).toBeGreaterThan(years[2]!);
    expect(monteCarloFi(base, 300, 1)).toEqual(monteCarloFi(base, 300, 1));
  });
  it("is not reachable with no contributions and too little invested", () => {
    const p = projectFi({ ...base, investable: 0, monthlyContribution: 0 }, { paths: 100 });
    expect(p.window).toBeNull();
  });
  it("counts retained cash at zero real return, and investing it is better", () => {
    const cash = simulateFi({ ...base, monthlyContribution: 0, cashContribution: 200_000 }, SCENARIOS[1]!).months!;
    const invested = simulateFi(base, SCENARIOS[1]!).months!;
    expect(invested).toBeLessThan(cash);
  });
  it("flags early access limits for retirement-heavy portfolios", () => {
    const p = projectFi({ ...base, investable: 80_000_000 }, { paths: 100 });
    expect(p.accessNote).toMatch(/59.5/);
  });
});

describe("goal interpretation", () => {
  const today = "2026-10-17";
  const kind = (t: string) => interpretGoals(t, today).map((g) => g.kind);
  it.each([
    ["I want to retire as soon as possible.", "financial_independence"],
    ["I want to become financially independent.", "financial_independence"],
    ["I want to buy a house eventually.", "home_purchase"],
    ["I want to stop living paycheck to paycheck.", "stability"],
    ["I want to travel more without feeling guilty.", "travel"],
    ["I want to eliminate my debt.", "debt_freedom"],
    ["I want to maximize my wealth.", "wealth"],
    ["I want to be able to afford having children.", "family"],
    ["I want to work less by the time I'm 40.", "financial_independence"],
    ["I want to save $50,000 in three years.", "savings_target"],
    ["I want to spend more time with my family.", "family"],
  ])("%s → %s", (text, k) => {
    expect(kind(text)[0]).toBe(k);
  });
  it("extracts amounts, dates and ages", () => {
    expect(parseAmount("save $50,000")).toBe(5_000_000);
    expect(parseAmount("about 50k")).toBe(5_000_000);
    expect(parseTiming("in three years", today).date).toBe("2029-10-17");
    expect(parseTiming("by the time I'm 40", today).age).toBe(40);
    const [g] = interpretGoals("I want to save $50,000 in three years.", today);
    expect(g!.target).toEqual({ amount: 5_000_000, date: "2029-10-17" });
  });
  it("splits competing goals", () => {
    expect(kind("I want to retire early, but also buy a larger home and travel twice a year")).toEqual(["financial_independence", "home_purchase", "travel"]);
  });
});

describe("recommendation resurfacing", () => {
  it("needs 30 days and a material change", () => {
    const d = new Date("2026-09-01");
    expect(shouldResurface(10000, 20000, d, new Date("2026-09-10"))).toBe(false);
    expect(shouldResurface(10000, 11000, d, new Date("2026-10-10"))).toBe(false);
    expect(shouldResurface(10000, 16000, d, new Date("2026-10-10"))).toBe(true);
  });
});
