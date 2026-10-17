import { type Baseline, computeBaseline, monthToDate, typicalSpendByDay } from "./analysis";
import { type BusinessRecord, type BusinessView, computeBusiness, isOwnersMoney } from "./business";
import { type BudgetItem, type BudgetLine, autoBudget, budgetStatus } from "./budget";
import { type CashModel, type Forecast, type SafeToSpend, buildCashModel, forecastCash, safeToSpend } from "./cashflow";
import type { CategoryId } from "./categories";
import { addMonths, DAYS_PER_MONTH, daysBetween, type ISODate } from "./dates";
import { type Debt, interestBearing, payoffPlan } from "./debt";
import { type FiInputs, type FiProjection, type LifeEvent, projectFi } from "./fi";
import { type FactKey, FACT_QUESTIONS, type GoalInterpretation, type GoalKind } from "./goals";
import { isCashReserve, isRetirement, isSpendable, type LedgerAccount, type LedgerTxn, netWorthValue } from "./ledger";
import { formatMoney, type Minor } from "./money";
import { detectRecurring, MONTHLY_FACTOR, type RecurringSeries } from "./recurring";

/** Planning facts, already typed. Missing = undefined. */
export interface Facts {
  birthYear?: number;
  retirementSpendingAnnual?: Minor;
  outsideInvestments?: Minor;
  workplaceContributionMonthly?: Minor;
  socialSecurityAnnual?: Minor;
  homePrice?: Minor;
  travelBudgetAnnual?: Minor;
  childrenPlannedInYears?: number;
  childCostMonthly?: Minor;
  emergencyMonths?: number;
  /** Keys the user explicitly declined to answer. */
  skipped?: FactKey[];
}

export interface Preferences {
  lifestyleWeight: number; // 0..100
  protectedCategories: CategoryId[];
  bufferMinor: Minor | null;
  /** Monthly savings the user committed to (e.g. by applying a recommendation); reserved by Safe to Spend. */
  committedSavingsMonthly?: Minor;
}

export interface GoalRecord {
  id: string;
  kind: GoalKind;
  title: string;
  priority: number; // 1 = most important
  interpretation: GoalInterpretation;
  targetMinor: Minor | null;
  targetDate: ISODate | null;
}

/** Inputs that scenarios may adjust. Built once from real data. */
export interface PlanInputs {
  asOf: ISODate;
  age: number | null;
  monthlyIncome: Minor;
  monthlySpending: Minor;
  essentialSpending: Minor;
  travelMonthly: Minor;
  investingMonthly: Minor; // observed transfers to investments + stated payroll contributions
  savingsMonthly: Minor; // observed transfers to cash savings
  /** Net monthly growth of bank (depository) balances: surplus that stays as cash. */
  cashRetainedMonthly: Minor;
  invested: Minor; // connected + stated outside investments
  retirementShare: number;
  reserves: Minor; // savings-type cash
  cash: Minor; // checking-type cash
  debts: Debt[];
  facts: Facts;
  events: LifeEvent[];
  /** Tax on business profit that personal money has to cover (pass-through entities). */
  businessTaxMonthly?: Minor;
  /** The owner's after-tax business profit left in businesses whose money counts as theirs. */
  businessRetainedMonthly?: Minor;
}

export type GoalStatus = "on_track" | "behind" | "ahead" | "projected" | "needs_info" | "not_reachable" | "tracking";

export interface GoalView {
  id: string;
  kind: GoalKind;
  title: string;
  priority: number;
  status: GoalStatus;
  headline: string; // e.g. "Age 48–53"
  detail: string; // one sentence
  progress: number | null; // 0..1
  /** What the user puts toward this goal today (observed). */
  contributionMonthly: Minor;
  /** Extra monthly amount Link's plan suggests on top. */
  allocationMonthly: Minor;
  /** The projection if the plan's extra amount is followed. */
  withPlan?: { headline: string; status: GoalStatus; projectedDate?: ISODate | null; fiWindow?: FiProjection["window"] } | null;
  fi?: FiProjection;
  targetAmount?: Minor;
  savedAmount?: Minor;
  projectedDate?: ISODate | null;
  missing: { key: FactKey; question: string; impact: "high" | "medium" | "low"; why: string }[];
  assumptions: string[];
}

export interface Allocation {
  target: string; // goal id | "reserve"
  label: string;
  monthly: Minor;
  reason: string;
}

export interface Picture {
  version: 1;
  asOf: ISODate;
  currency: string;
  freshness: { cashAsOf: string | null; stale: boolean };
  coverage: {
    historyDays: number;
    monthsAnalyzed: number;
    accounts: number;
    transactions: number;
    autoCategorized: number; // share 0..1 classified without needing review
    reviewCount: number;
    otherCurrencyTxns: number;
  };
  position: {
    cash: Minor;
    reserves: Minor;
    invested: Minor;
    retirement: Minor;
    outsideInvestments: Minor | null;
    cardDebt: Minor;
    loanDebt: Minor;
    netWorth: Minor;
    investmentsKnown: boolean;
    /** The user's share of their businesses' net worth (included in netWorth). */
    businessEquity: Minor;
  };
  baseline: Baseline;
  flows: { investingMonthly: Minor; savingsMonthly: Minor; surplusUnassigned: Minor; businessTaxMonthly: Minor; businessRetainedMonthly: Minor };
  recurring: Pick<RecurringSeries, "key" | "merchant" | "kind" | "category" | "cadence" | "amount" | "nextDate" | "confidence" | "accountId" | "occurrences" | "firstDate" | "lastDate">[];
  safeToSpend: SafeToSpend;
  forecast: { days: number; points: { date: ISODate; expected: Minor; low: Minor; high: Minor }[]; shortfall: Forecast["shortfall"]; lowest: Forecast["lowest"]; events: Forecast["events"] };
  budget: { lines: BudgetLine[]; spentThisMonth: Minor; plannedThisMonth: Minor; incomeThisMonth: Minor; typicalByNow: Minor };
  goals: GoalView[];
  allocations: Allocation[];
  questions: { key: FactKey; question: string; why: string; goalId: string }[];
  businesses: BusinessView[];
}

const RECURRING_TOP = 40;

/**
 * Monthly surplus not yet spoken for. Workplace contributions come out of pay
 * before it reaches the bank (they're already excluded from net income), so only
 * investing seen leaving the bank is subtracted.
 */
export function freeSurplus(inputs: PlanInputs): Minor {
  const fromBank = inputs.investingMonthly - (inputs.facts.workplaceContributionMonthly ?? 0);
  return inputs.monthlyIncome - inputs.monthlySpending - Math.max(0, fromBank) - inputs.savingsMonthly - (inputs.businessTaxMonthly ?? 0) + (inputs.businessRetainedMonthly ?? 0);
}

export function factsAge(facts: Facts, asOf: ISODate): number | null {
  return facts.birthYear ? Number(asOf.slice(0, 4)) - facts.birthYear : null;
}

/** Observed monthly flows into investments and savings, from detected recurring transfers. */
function observedFlows(series: RecurringSeries[], accounts: LedgerAccount[]) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  let investing = 0;
  let saving = 0;
  for (const s of series) {
    if (!s.active || s.amount >= 0) continue;
    const from = byId.get(s.accountId);
    if (!from || !isSpendable(from)) continue;
    const monthly = Math.round(-s.amount * MONTHLY_FACTOR[s.cadence]);
    if (s.category === "investment") investing += monthly;
    else if (s.kind === "savings") saving += monthly;
  }
  return { investing, saving };
}

export function buildPlanInputs(args: {
  asOf: ISODate;
  accounts: LedgerAccount[];
  baseline: Baseline;
  series: RecurringSeries[];
  facts: Facts;
  /** Typical monthly charges per card, to tell revolving balances from pay-in-full ones. */
  cardMonthly?: Map<string, Minor>;
  cashRetainedMonthly?: Minor;
}): PlanInputs {
  const { accounts, baseline, series, facts, asOf } = args;
  const visible = accounts.filter((a) => !a.hidden);
  const cash = visible.filter(isSpendable).reduce((s, a) => s + (a.current ?? 0), 0);
  const reserves = visible.filter(isCashReserve).reduce((s, a) => s + (a.current ?? 0), 0);
  const investments = visible.filter((a) => a.type === "investment");
  const retirement = investments.filter(isRetirement).reduce((s, a) => s + (a.current ?? 0), 0);
  const connectedInvested = investments.reduce((s, a) => s + (a.current ?? 0), 0);
  const outside = facts.outsideInvestments ?? 0;
  const invested = connectedInvested + outside;
  const flows = observedFlows(series, visible);
  const debts: Debt[] = visible
    .filter((a) => (a.type === "credit" || a.type === "loan") && (a.current ?? 0) > 0)
    .map((a) => {
      const balance = a.current ?? 0;
      const kind = a.type === "credit" ? ("card" as const) : (a.subtype ?? "").includes("mortgage") ? ("mortgage" as const) : ("loan" as const);
      const monthly = args.cardMonthly?.get(a.id) ?? 0;
      const revolving = kind === "card" ? balance > Math.max(monthly * 1.6, 100_00) : true;
      return { id: a.id, name: a.name, balance, aprBps: a.aprBps ?? null, minPayment: a.minPayment ?? null, kind, revolving };
    });
  const events: LifeEvent[] = [];
  if (facts.childrenPlannedInYears != null) events.push(childEvent(facts.childrenPlannedInYears, facts.childCostMonthly));
  return {
    asOf,
    age: factsAge(facts, asOf),
    monthlyIncome: baseline.income,
    monthlySpending: baseline.spending,
    essentialSpending: baseline.essential,
    travelMonthly: baseline.categories.find((c) => c.category === "travel")?.monthly ?? 0,
    investingMonthly: flows.investing + (facts.workplaceContributionMonthly ?? 0),
    savingsMonthly: flows.saving,
    cashRetainedMonthly: Math.max(0, args.cashRetainedMonthly ?? 0),
    invested,
    // Unknown outside investments are assumed to be retirement accounts (the common case: a 401(k)).
    retirementShare: invested > 0 ? (retirement + outside) / invested : 0,
    reserves,
    cash,
    debts,
    facts,
    events,
  };
}

/** USDA-based middle-income estimate, rounded; replaced by the user's own number when given. */
export const DEFAULT_CHILD_COST_MONTHLY = 1_500_00;

export function childEvent(inYears: number, monthlyCost?: Minor): LifeEvent {
  const cost = monthlyCost ?? DEFAULT_CHILD_COST_MONTHLY;
  return { label: "Child", startYear: inYears, years: 18, monthlyContributionDelta: -cost };
}

function retirementSpending(inputs: PlanInputs): { annual: Minor; assumed: boolean } {
  if (inputs.facts.retirementSpendingAnnual) return { annual: inputs.facts.retirementSpendingAnnual, assumed: false };
  // Today's spending minus what goes to debt service that ends before retirement is a reasonable first guess;
  // we keep it simple and explicit: current spending.
  return { annual: inputs.monthlySpending * 12, assumed: true };
}

export function fiInputs(inputs: PlanInputs, extraMonthly = 0): FiInputs {
  const spend = retirementSpending(inputs);
  return {
    currentAge: inputs.age,
    investable: inputs.invested,
    retirementShare: inputs.retirementShare,
    monthlyContribution: Math.max(0, inputs.investingMonthly + extraMonthly),
    // Extra investing comes out of cash that would otherwise sit in the bank.
    cashContribution: Math.max(0, inputs.cashRetainedMonthly - Math.max(0, extraMonthly)),
    annualSpending: spend.annual,
    socialSecurityAnnual: inputs.facts.socialSecurityAnnual ?? null,
    events: inputs.events,
  };
}

const fmtYears = (y: number) => (y < 1 ? "under a year" : `${Math.round(y)} year${Math.round(y) === 1 ? "" : "s"}`);

function rangeLabel(fromAge: number | null, toAge: number | null, fromYears: number, toYears: number) {
  if (fromAge != null && toAge != null) {
    const a = Math.round(fromAge);
    const b = Math.round(toAge);
    return a === b ? `Age ${a}` : `Age ${a}–${b}`;
  }
  const a = Math.round(fromYears);
  const b = Math.round(toYears);
  return a === b ? `In ${fmtYears(a)}` : `In ${a}–${b} years`;
}

function monthsToTarget(remaining: Minor, monthly: Minor): number | null {
  if (remaining <= 0) return 0;
  if (monthly <= 0) return null;
  return Math.ceil(remaining / monthly);
}

function missingFor(goal: GoalRecord, facts: Facts, inputs: PlanInputs, connectedInvestments: boolean) {
  const known: Partial<Record<FactKey, boolean>> = {
    birth_year: facts.birthYear != null,
    retirement_spending_annual: facts.retirementSpendingAnnual != null,
    outside_investments: facts.outsideInvestments != null,
    workplace_contribution_monthly: facts.workplaceContributionMonthly != null,
    social_security_annual: facts.socialSecurityAnnual != null,
    home_price: facts.homePrice != null || goal.targetMinor != null,
    travel_budget_annual: facts.travelBudgetAnnual != null,
    children_planned: facts.childrenPlannedInYears != null,
    child_cost_monthly: facts.childCostMonthly != null,
    emergency_months: facts.emergencyMonths != null,
  };
  return goal.interpretation.missing
    .filter((m) => !known[m.key] && !(facts.skipped ?? []).includes(m.key))
    .map((m) => (m.key === "outside_investments" && !connectedInvestments ? { ...m, impact: "high" as const } : m));
}

/**
 * Project one goal. `allocation` is the monthly amount going to it: for
 * independence it is investing *on top of* current investing; for cash goals
 * it is the monthly saving toward it; for debt the extra payment.
 */
export function projectGoal(goal: GoalRecord, inputs: PlanInputs, allocation: Minor, ctx: { reservesForGoal: Minor; connectedInvestments: boolean }): GoalView {
  const missing = missingFor(goal, inputs.facts, inputs, ctx.connectedInvestments);
  const base = { id: goal.id, kind: goal.kind, title: goal.title, priority: goal.priority, contributionMonthly: allocation, allocationMonthly: 0, missing };
  const assumptions: string[] = [];
  const target = goal.interpretation.target;

  switch (goal.kind) {
    case "financial_independence": {
      const fi = fiInputs(inputs, allocation);
      const spend = retirementSpending(inputs);
      if (spend.assumed) assumptions.push("Retirement spending equals what you spend today.");
      if (!inputs.facts.outsideInvestments && !ctx.connectedInvestments) assumptions.push("No investments outside the accounts you've connected.");
      if (!inputs.facts.socialSecurityAnnual) assumptions.push("Social Security is not counted.");
      assumptions.push("Returns are after inflation: 3%, 4.5% or 6% a year depending on the scenario.");
      if (allocation > 0) assumptions.push(`Includes investing ${formatMoney(allocation)} more each month.`);
      if (fi.cashContribution) assumptions.push(`The ${formatMoney(fi.cashContribution)} a month that stays in your bank accounts keeps building up as cash, earning nothing after inflation.`);
      const proj = projectFi(fi, { paths: 600 });
      if (!proj.window) {
        return {
          ...base,
          status: fi.monthlyContribution <= 0 ? "not_reachable" : "behind",
          headline: fi.monthlyContribution <= 0 ? "Not investing yet" : "Beyond 60 years",
          detail:
            fi.monthlyContribution <= 0
              ? "Nothing is going into investments yet, so there's no path to independence to project."
              : "At the current pace, independence is more than 60 years out.",
          progress: proj.progress,
          fi: proj,
          missing,
          assumptions,
        };
      }
      const w = proj.window;
      const headline = rangeLabel(w.fromAge, w.toAge, w.fromYears, w.toYears);
      let status: GoalStatus = inputs.age == null ? "needs_info" : "projected";
      if (target.age && w.toAge != null) status = w.toAge <= target.age ? "on_track" : w.fromAge! <= target.age ? "projected" : "behind";
      return {
        ...base,
        status,
        headline,
        detail:
          proj.monteCarlo.reachedShare < 0.9
            ? `In ${Math.round((1 - proj.monteCarlo.reachedShare) * 100)}% of simulated markets you don't get there within 60 years.`
            : `About ${Math.round(proj.progress * 100)}% of the way there, investing ${formatMoney(fi.monthlyContribution)} a month.`,
        progress: proj.progress,
        fi: proj,
        assumptions,
      };
    }
    case "emergency_fund":
    case "stability": {
      const months = inputs.facts.emergencyMonths ?? (goal.kind === "stability" ? 3 : 6);
      if (inputs.essentialSpending <= 0) {
        return { ...base, status: "needs_info", headline: "Learning your spending", detail: "Link needs a few weeks of history to size this.", progress: null, assumptions };
      }
      const essential = inputs.essentialSpending;
      const targetAmount = months * essential;
      const saved = ctx.reservesForGoal;
      const covered = saved / essential;
      const left = monthsToTarget(targetAmount - saved, allocation);
      return {
        ...base,
        status: saved >= targetAmount ? "on_track" : left == null ? "behind" : "projected",
        headline: `${covered.toFixed(1)} of ${months} months`,
        detail:
          saved >= targetAmount
            ? "Fully funded."
            : left == null
              ? "Nothing is being set aside for this yet."
              : `Fully funded in about ${left} month${left === 1 ? "" : "s"} at the planned pace.`,
        progress: Math.min(1, saved / targetAmount),
        targetAmount,
        savedAmount: saved,
        projectedDate: left == null ? null : addMonths(inputs.asOf, left),
        assumptions: [`Target is ${months} months of essential spending.`],
      };
    }
    case "debt_freedom": {
      const debts = inputs.debts.filter(interestBearing);
      const known = debts.filter((d) => d.aprBps != null);
      const unknown = debts.filter((d) => d.aprBps == null);
      // Only debts with a known rate are simulated, so only their minimums fund the plan.
      const minimums = known.reduce((s, d) => s + (d.minPayment ?? Math.max(25_00, Math.round(d.balance * 0.02))), 0);
      const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
      if (!debts.length) {
        return { ...base, status: "on_track", headline: "No debt", detail: "No balances on connected accounts.", progress: 1, assumptions };
      }
      if (!known.length) {
        return {
          ...base,
          status: "needs_info",
          headline: "Rates unknown",
          detail: "Add your interest rates to see a payoff date.",
          progress: null,
          assumptions: ["Interest rates are never guessed."],
        };
      }
      const plan = payoffPlan(known, minimums + allocation, "avalanche");
      const date = plan.months == null ? null : addMonths(inputs.asOf, plan.months);
      return {
        ...base,
        status: unknown.length ? "needs_info" : date == null ? "behind" : target.date && date > target.date ? "behind" : "projected",
        headline: date ? `Debt-free ${formatMonthYear(date)}` : "Not paying down",
        detail: date ? `Highest-rate debt first. Interest along the way: about ${formatMoney(plan.totalInterest)}.` : "Payments don't cover interest.",
        progress: null,
        targetAmount: totalDebt,
        projectedDate: date,
        assumptions: unknown.length ? [`Not counting ${unknown.map((d) => d.name).join(", ")}: add the interest rate to include ${unknown.length === 1 ? "it" : "them"}.`] : [],
      };
    }
    case "home_purchase":
    case "savings_target":
    case "purchase": {
      const price = inputs.facts.homePrice;
      const targetAmount =
        goal.targetMinor ?? target.amount ?? (goal.kind === "home_purchase" && price ? Math.round(price * 0.23) : null);
      if (goal.kind === "home_purchase" && price && !goal.targetMinor && !target.amount) {
        assumptions.push("Target is a 20% down payment plus about 3% in closing costs.");
      }
      if (!targetAmount) {
        return {
          ...base,
          status: "needs_info",
          headline: "Needs a target",
          detail: goal.kind === "home_purchase" ? "Tell Link a rough price to size the down payment." : "Add an amount to track progress.",
          progress: null,
          assumptions,
        };
      }
      const saved = ctx.reservesForGoal;
      const monthly = allocation;
      const left = monthsToTarget(targetAmount - saved, monthly);
      const projectedDate = left == null ? null : addMonths(inputs.asOf, left);
      const due = goal.targetDate ?? target.date ?? null;
      let status: GoalStatus = left == null ? "behind" : "projected";
      if (due && projectedDate) status = projectedDate <= due ? "on_track" : "behind";
      if (saved >= targetAmount) status = "on_track";
      return {
        ...base,
        status,
        headline: saved >= targetAmount ? "Funded" : projectedDate ? (due ? (status === "on_track" ? `On track for ${formatMonthYear(due)}` : `Reached ${formatMonthYear(projectedDate)}`) : `Reached ${formatMonthYear(projectedDate)}`) : "Not funded yet",
        detail: `${formatMoney(saved)} of ${formatMoney(targetAmount)}${monthly > 0 ? `, adding ${formatMoney(monthly)} a month` : ""}.`,
        progress: Math.min(1, saved / targetAmount),
        targetAmount,
        savedAmount: saved,
        projectedDate,
        assumptions,
      };
    }
    case "travel": {
      const annual = inputs.facts.travelBudgetAnnual ?? inputs.travelMonthly * 12;
      if (!inputs.facts.travelBudgetAnnual) assumptions.push("Travel budget equals what you've spent recently.");
      const surplus = inputs.monthlyIncome - inputs.monthlySpending;
      return {
        ...base,
        status: surplus >= 0 ? "on_track" : "behind",
        headline: annual > 0 ? `${formatMoney(annual)} a year` : "No travel budget yet",
        detail: surplus >= 0 ? "Protected in your plan." : "Your spending already exceeds income.",
        progress: null,
        assumptions,
      };
    }
    case "family": {
      const cost = inputs.facts.childCostMonthly ?? DEFAULT_CHILD_COST_MONTHLY;
      const room = inputs.monthlyIncome - inputs.monthlySpending - cost;
      if (!inputs.facts.childCostMonthly) assumptions.push("A child is assumed to cost about $1,500 a month (USDA middle-income estimate).");
      return {
        ...base,
        status: room >= 0 ? "on_track" : "behind",
        headline: room >= 0 ? "Room in your plan" : "Tight",
        detail: room >= 0 ? `About ${formatMoney(room)} a month left after estimated child costs.` : `About ${formatMoney(-room)} a month short once child costs begin.`,
        progress: null,
        assumptions,
      };
    }
    case "wealth": {
      const r = 0.045;
      let nw = inputs.invested + inputs.reserves + inputs.cash - inputs.debts.reduce((s, d) => s + d.balance, 0);
      const monthly = inputs.investingMonthly + inputs.savingsMonthly + allocation;
      for (let m = 0; m < 120; m++) nw = nw * (1 + r) ** (1 / 12) + monthly;
      assumptions.push("4.5% annual return after inflation; today's dollars.");
      return {
        ...base,
        status: "projected",
        headline: `${formatMoney(Math.round(nw), { compact: true })} in 10 years`,
        detail: `Saving and investing ${formatMoney(monthly)} a month.`,
        progress: null,
        assumptions,
      };
    }
    default:
      return { ...base, status: "tracking", headline: "Tracking", detail: goal.interpretation.summary, progress: null, assumptions };
  }
}

export function formatMonthYear(d: ISODate) {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Split the unassigned monthly surplus across goals. Foundations first (a
 * minimal cash reserve, then high-interest debt), then goals by priority.
 * Lifestyle weight keeps part of the surplus unassigned as spending room.
 */
export function allocate(inputs: PlanInputs, goals: GoalRecord[], prefs: Preferences): { allocations: Allocation[]; unassigned: Minor } {
  const surplus = freeSurplus(inputs);
  const allocations: Allocation[] = [];
  if (surplus <= 0) return { allocations, unassigned: surplus };
  // Keep a margin for variability and lifestyle: 10% to 40% of the surplus.
  const margin = Math.round(surplus * (0.1 + 0.3 * (prefs.lifestyleWeight / 100)));
  let pool = surplus - margin;

  // An emergency reserve comes before anything else.
  const reserveTarget = (inputs.facts.emergencyMonths ?? 3) * inputs.essentialSpending;
  if (inputs.reserves < reserveTarget && pool > 0) {
    const need = reserveTarget - inputs.reserves;
    const monthly = Math.min(pool, Math.max(Math.ceil(need / 6), 50_00));
    allocations.push({ target: "reserve", label: "Emergency reserve", monthly, reason: `${inputs.facts.emergencyMonths ?? 3} months of essentials in savings comes first.` });
    pool -= monthly;
  }

  const highInterest = inputs.debts.filter((d) => interestBearing(d) && (d.aprBps ?? 0) >= 800);
  const debtGoal = goals.find((g) => g.kind === "debt_freedom");
  if (highInterest.length && pool > 0) {
    const monthly = Math.round(pool * (debtGoal ? 0.6 : 0.4));
    allocations.push({ target: debtGoal?.id ?? "debt", label: debtGoal?.title ?? "High-interest debt", monthly, reason: "Interest above 8% beats expected investment returns." });
    pool -= monthly;
  }

  // Business growth is funded by the business itself, not by personal surplus.
  const active = goals.filter((g) => g.kind !== "travel" && g.kind !== "family" && g.kind !== "custom" && g.kind !== "business_growth" && !(g.kind === "debt_freedom" && highInterest.length));
  // Time-bound goals get what they need first, capped at half the remaining pool each.
  for (const g of [...active].sort((a, b) => a.priority - b.priority)) {
    const due = g.targetDate ?? g.interpretation.target.date;
    const amount = g.targetMinor ?? g.interpretation.target.amount;
    if (!due || !amount || pool <= 0) continue;
    const months = Math.max(1, Math.round(daysBetween(inputs.asOf, due) / DAYS_PER_MONTH));
    const monthly = Math.min(Math.ceil(amount / months), Math.round(pool / 2));
    allocations.push({ target: g.id, label: g.title, monthly, reason: `Needed to reach it by ${formatMonthYear(due)}.` });
    pool -= monthly;
  }
  const open = active.filter((g) => !allocations.some((a) => a.target === g.id));
  const weights = open.map((g) => 1 / g.priority);
  const totalW = weights.reduce((a, b) => a + b, 0);
  open.forEach((g, i) => {
    const monthly = Math.floor((pool * weights[i]!) / totalW / 100) * 100;
    if (monthly > 0) allocations.push({ target: g.id, label: g.title, monthly, reason: `Priority ${g.priority} goal.` });
  });
  const assigned = allocations.reduce((s, a) => s + a.monthly, 0);
  return { allocations, unassigned: surplus - assigned };
}

export interface PictureInput {
  asOf: ISODate;
  currency: string;
  accounts: LedgerAccount[];
  txns: LedgerTxn[];
  reviewCount: number;
  otherCurrencyTxns?: number;
  goals: GoalRecord[];
  facts: Facts;
  prefs: Preferences;
  budget: BudgetItem[] | null;
  /** Series the user marked as not recurring. */
  ignoredRecurring?: Set<string>;
  now?: Date;
  businesses?: BusinessRecord[];
}

export function computePicture(input: PictureInput): Picture {
  return computeAll(input).picture;
}

/** Picture plus the PlanInputs it was derived from (scenarios start from the same inputs). */
export function computeAll(input: PictureInput): { picture: Picture; inputs: PlanInputs } {
  const { asOf, accounts, txns, goals, facts, prefs } = input;
  const businesses = input.businesses ?? [];
  const businessIds = new Set(businesses.map((b) => b.id));
  const allVisible = accounts.filter((a) => !a.hidden);
  // The personal picture only ever sees personal accounts; each business is summarized on its own.
  const visible = allVisible.filter((a) => !a.businessId || !businessIds.has(a.businessId));
  const visibleIds = new Set(visible.map((a) => a.id));
  const ledger = txns.filter((t) => visibleIds.has(t.accountId));
  const businessViews = businesses.map((b) => {
    const accts = allVisible.filter((a) => a.businessId === b.id);
    const ids = new Set(accts.map((a) => a.id));
    return computeBusiness(b, accts, txns.filter((t) => ids.has(t.accountId)), asOf);
  });

  const series = detectRecurring(ledger, asOf).filter((s) => !input.ignoredRecurring?.has(s.key));
  const baseline = computeBaseline(ledger, series, asOf);
  const model: CashModel = buildCashModel({ accounts: visible, txns: ledger, series, asOf });
  const inputs = buildPlanInputs({
    asOf,
    accounts: visible,
    baseline,
    series,
    facts,
    cardMonthly: model.cardMonthly,
    cashRetainedMonthly: cashRetained(ledger, visible, baseline.months),
  });
  // Only businesses whose money is the owner's (opted in, or a sole proprietorship) count toward personal goals.
  const owners = businessViews.filter(isOwnersMoney);
  const businessForGoals = owners.reduce((s, b) => s + Math.max(0, Math.round((b.cash * b.ownershipPct) / 100)), 0);
  // Every pass-through business's drawn profit carries personal tax; profit kept in an owner's business keeps accruing.
  inputs.businessTaxMonthly = businessViews.reduce((s, b) => s + b.personalTaxMonthly, 0);
  inputs.businessRetainedMonthly = owners.reduce((s, b) => s + b.retainedMonthly, 0);
  if (businessForGoals > 0) {
    const retirementAmount = inputs.retirementShare * inputs.invested;
    inputs.invested += businessForGoals;
    inputs.retirementShare = inputs.invested > 0 ? retirementAmount / inputs.invested : 0;
  }
  const cardPaymentDays = new Map<string, number[]>();
  for (const t of ledger) {
    const acct = visible.find((a) => a.id === t.accountId);
    if (acct?.type === "credit" && t.kind === "card_payment" && t.amount > 0) {
      const arr = cardPaymentDays.get(acct.id) ?? [];
      arr.push(Number(t.date.slice(8, 10)));
      cardPaymentDays.set(acct.id, arr);
    }
  }
  const committedSavings = prefs.committedSavingsMonthly ?? 0;
  const sts = safeToSpend({ model, essentialMonthly: baseline.essential, bufferOverride: prefs.bufferMinor, committedSavingsMonthly: committedSavings, now: input.now, cardPaymentDays });
  const fc = forecastCash(model, 90, cardPaymentDays);

  const mtd = monthToDate(ledger, asOf);
  const budgetItems = input.budget ?? autoBudget(baseline);
  const lines = budgetStatus(budgetItems, mtd.byCategory, asOf);

  const { allocations, unassigned } = allocate(inputs, goals, prefs);
  const allocationFor = (id: string) => allocations.filter((a) => a.target === id).reduce((s, a) => s + a.monthly, 0);

  // Existing reserves are assigned: emergency/stability goals first, then cash goals by priority.
  let reservesLeft = inputs.reserves;
  const reservesFor = new Map<string, Minor>();
  const ordered = [...goals].sort((a, b) => {
    const rank = (g: GoalRecord) => (g.kind === "emergency_fund" || g.kind === "stability" ? 0 : 1);
    return rank(a) - rank(b) || a.priority - b.priority;
  });
  for (const g of ordered) {
    if (!["emergency_fund", "stability", "home_purchase", "savings_target", "purchase"].includes(g.kind)) continue;
    let take = reservesLeft;
    if (g.kind === "emergency_fund" || g.kind === "stability") {
      const months = facts.emergencyMonths ?? (g.kind === "stability" ? 3 : 6);
      take = Math.min(reservesLeft, months * Math.max(1, inputs.essentialSpending));
      if (g.kind === "stability") take = Math.min(take + inputs.cash, reservesLeft + inputs.cash);
    }
    reservesFor.set(g.id, Math.max(0, take));
    reservesLeft -= Math.max(0, Math.min(take, reservesLeft));
  }
  const connectedInvestments = visible.some((a) => a.type === "investment");
  const current = currentContributions(inputs, goals, reservesFor);
  const goalViews = [...goals]
    .sort((a, b) => a.priority - b.priority)
    .map((g) => {
      const ctx = { reservesForGoal: reservesFor.get(g.id) ?? 0, connectedInvestments };
      const contribution = current.get(g.id) ?? 0;
      const view = projectGoal(g, inputs, contribution, ctx);
      const extra = allocationFor(g.id);
      if (extra > 0) {
        const planned = projectGoal(g, inputs, contribution + extra, ctx);
        view.withPlan = { headline: planned.headline, status: planned.status, projectedDate: planned.projectedDate ?? null, fiWindow: planned.fi?.window ?? null };
      }
      return { ...view, contributionMonthly: contribution, allocationMonthly: extra };
    });

  const questions = goalViews
    .flatMap((g) => g.missing.map((m) => ({ key: m.key, question: m.question, why: m.why, goalId: g.id, impact: m.impact, priority: g.priority })))
    .sort((a, b) => rankImpact(a.impact) - rankImpact(b.impact) || a.priority - b.priority)
    .filter((q, i, arr) => arr.findIndex((x) => x.key === q.key) === i)
    .map(({ key, question, why, goalId }) => ({ key, question, why, goalId }));

  const cardDebt = visible.filter((a) => a.type === "credit").reduce((s, a) => s + Math.max(0, a.current ?? 0), 0);
  const loanDebt = visible.filter((a) => a.type === "loan").reduce((s, a) => s + Math.max(0, a.current ?? 0), 0);
  const invested = visible.filter((a) => a.type === "investment").reduce((s, a) => s + (a.current ?? 0), 0);
  const retirement = visible.filter(isRetirement).reduce((s, a) => s + (a.current ?? 0), 0);
  const businessEquity = businessViews.reduce((s, b) => s + b.ownerShare, 0);
  const netWorth = visible.reduce((s, a) => s + netWorthValue(a), 0) + (facts.outsideInvestments ?? 0) + businessEquity;
  for (const v of goalViews) {
    if (v.kind === "financial_independence" && businessForGoals > 0) {
      v.assumptions.push(`Includes ${formatMoney(businessForGoals)} of business cash you chose to count toward your goals.`);
    }
    if (v.kind === "business_growth") {
      const b = businessViews[0];
      if (!b) {
        Object.assign(v, { status: "needs_info", headline: "No business accounts yet", detail: "Mark an account as a business account to track it here." });
      } else if (!b.monthsAnalyzed) {
        Object.assign(v, { status: "tracking", headline: "Learning your business", detail: "A full month of history is needed for a trend." });
      } else {
        const last = b.months.at(-1)!;
        Object.assign(v, {
          status: b.profit > 0 ? "projected" : "behind",
          headline: `${formatMoney(b.profit)}/mo profit`,
          detail: `${b.name}: about ${formatMoney(b.revenue)} revenue a month${b.margin != null ? `, ${Math.round(b.margin * 100)}% margin` : ""}. Last month ${formatMoney(last.profit)} profit.`,
          progress: null,
        });
      }
    }
  }
  const auto = ledger.length ? ledger.filter((t) => !t.pending).length : 0;

  const picture: Picture = {
    version: 1,
    asOf,
    currency: input.currency,
    freshness: { cashAsOf: model.cashAsOf, stale: sts.status === "stale" },
    coverage: {
      historyDays: baseline.historyDays,
      monthsAnalyzed: baseline.monthsAnalyzed,
      accounts: allVisible.length,
      transactions: ledger.length,
      autoCategorized: auto ? Math.round(((auto - input.reviewCount) / auto) * 1000) / 1000 : 1,
      reviewCount: input.reviewCount,
      otherCurrencyTxns: input.otherCurrencyTxns ?? 0,
    },
    position: {
      cash: inputs.cash,
      reserves: inputs.reserves,
      invested,
      retirement,
      outsideInvestments: facts.outsideInvestments ?? null,
      cardDebt,
      loanDebt,
      netWorth,
      investmentsKnown: connectedInvestments || facts.outsideInvestments != null,
      businessEquity,
    },
    baseline,
    flows: {
      investingMonthly: inputs.investingMonthly,
      savingsMonthly: inputs.savingsMonthly,
      surplusUnassigned: unassigned,
      businessTaxMonthly: inputs.businessTaxMonthly ?? 0,
      businessRetainedMonthly: inputs.businessRetainedMonthly ?? 0,
    },
    recurring: series.slice(0, RECURRING_TOP).map((s) => ({
      key: s.key,
      merchant: s.merchant,
      kind: s.kind,
      category: s.category,
      cadence: s.cadence,
      amount: s.amount,
      nextDate: s.nextDate,
      confidence: s.confidence,
      accountId: s.accountId,
      occurrences: s.occurrences,
      firstDate: s.firstDate,
      lastDate: s.lastDate,
    })),
    safeToSpend: sts,
    forecast: {
      days: fc.days,
      points: fc.points.filter((_, i) => i % 3 === 0 || i === fc.points.length - 1),
      shortfall: fc.shortfall,
      lowest: fc.lowest,
      events: fc.events.slice(0, 60),
    },
    budget: {
      lines,
      spentThisMonth: mtd.total,
      plannedThisMonth: budgetItems.reduce((s, i) => s + i.monthly, 0),
      incomeThisMonth: mtd.income,
      typicalByNow: typicalSpendByDay(ledger, baseline.months, Number(asOf.slice(8, 10))),
    },
    goals: goalViews,
    allocations,
    questions,
    businesses: businessViews,
  };
  return { picture, inputs };
}

/** Net monthly change of bank balances over complete months: money that stays as cash. */
export function cashRetained(ledger: LedgerTxn[], accounts: LedgerAccount[], months: string[]): Minor {
  if (!months.length) return 0;
  const bank = new Set(accounts.filter((a) => a.type === "depository").map((a) => a.id));
  const set = new Set(months);
  let total = 0;
  for (const t of ledger) if (!t.pending && bank.has(t.accountId) && set.has(t.date.slice(0, 7))) total += t.amount;
  return Math.round(total / months.length);
}

/**
 * What the user actually contributes to each goal today. Investing already
 * flows into independence (counted in PlanInputs), so FI gets 0 extra here;
 * observed transfers to savings go to the first cash goal that still needs money.
 */
function currentContributions(inputs: PlanInputs, goals: GoalRecord[], reservesFor: Map<string, Minor>): Map<string, Minor> {
  const out = new Map<string, Minor>();
  const cashGoals = [...goals]
    .filter((g) => ["emergency_fund", "stability", "home_purchase", "savings_target", "purchase"].includes(g.kind))
    .sort((a, b) => {
      const rank = (g: GoalRecord) => (g.kind === "emergency_fund" || g.kind === "stability" ? 0 : 1);
      return rank(a) - rank(b) || a.priority - b.priority;
    });
  for (const g of cashGoals) {
    const target = g.targetMinor ?? g.interpretation.target.amount ?? (g.kind === "emergency_fund" || g.kind === "stability" ? (inputs.facts.emergencyMonths ?? 3) * inputs.essentialSpending : null);
    if (target != null && (reservesFor.get(g.id) ?? 0) >= target) continue;
    out.set(g.id, inputs.savingsMonthly);
    break;
  }
  return out;
}

function rankImpact(i: "high" | "medium" | "low") {
  return i === "high" ? 0 : i === "medium" ? 1 : 2;
}

export { FACT_QUESTIONS };
