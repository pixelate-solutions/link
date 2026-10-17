import type { CategoryId } from "./categories";
import type { LifeEvent } from "./fi";
import { formatMoney, type Minor } from "./money";
import { childEvent, DEFAULT_CHILD_COST_MONTHLY, type GoalRecord, type GoalView, type PlanInputs, projectGoal } from "./plan";

/**
 * Scenarios are pure: they copy PlanInputs, apply changes, and re-project
 * goals with the same engines. They never touch stored plans.
 */
export type ScenarioChange =
  | { type: "spending"; monthlyDelta: Minor; category?: CategoryId; redirect?: "invest" | "save" | "none" }
  | { type: "investing"; monthlyDelta: Minor }
  | { type: "income"; monthlyDelta: Minor; startInYears?: number }
  | { type: "child"; inYears: number; monthlyCost?: Minor; years?: number }
  | { type: "retirement_spending"; annualDelta: Minor }
  | { type: "travel"; annualDelta: Minor }
  | { type: "one_time"; amount: Minor; inYears: number; label: string };

export interface ScenarioResult {
  title: string;
  assumptions: string[];
  before: GoalView[];
  after: GoalView[];
  monthlySurplusBefore: Minor;
  monthlySurplusAfter: Minor;
  deltas: { goalId: string; title: string; before: string; after: string; changeYears?: number | null; changeMonths?: number | null }[];
}

export function applyChanges(inputs: PlanInputs, changes: ScenarioChange[]): { inputs: PlanInputs; assumptions: string[] } {
  const next: PlanInputs = { ...inputs, facts: { ...inputs.facts }, events: [...inputs.events], debts: [...inputs.debts] };
  const assumptions: string[] = [];
  for (const c of changes) {
    switch (c.type) {
      case "spending": {
        next.monthlySpending = Math.max(0, next.monthlySpending + c.monthlyDelta);
        if (c.category === "travel") next.travelMonthly = Math.max(0, next.travelMonthly + c.monthlyDelta);
        const redirect = c.redirect ?? (c.monthlyDelta < 0 ? "invest" : "none");
        if (redirect === "invest") {
          next.investingMonthly = Math.max(0, next.investingMonthly - c.monthlyDelta);
          if (c.monthlyDelta < 0) assumptions.push(`The ${formatMoney(-c.monthlyDelta)} you don't spend is invested every month.`);
          else assumptions.push(`The extra ${formatMoney(c.monthlyDelta)} comes out of what you invest.`);
        } else if (redirect === "save") {
          next.savingsMonthly = Math.max(0, next.savingsMonthly - c.monthlyDelta);
          assumptions.push(`The ${formatMoney(Math.abs(c.monthlyDelta))} difference goes to savings.`);
        }
        if (!next.facts.retirementSpendingAnnual) {
          assumptions.push("Retirement spending moves with today's spending.");
        }
        break;
      }
      case "investing":
        next.investingMonthly = Math.max(0, next.investingMonthly + c.monthlyDelta);
        assumptions.push(`Invest ${formatMoney(Math.abs(c.monthlyDelta))} ${c.monthlyDelta >= 0 ? "more" : "less"} each month.`);
        break;
      case "income": {
        if (!c.startInYears) {
          next.monthlyIncome += c.monthlyDelta;
          next.investingMonthly = Math.max(0, next.investingMonthly + c.monthlyDelta);
          assumptions.push(`Income changes by ${formatMoney(c.monthlyDelta, { signed: true })} a month; the difference flows to investing.`);
        } else {
          next.events.push({ label: "Income change", startYear: c.startInYears, years: null, monthlyContributionDelta: c.monthlyDelta });
          assumptions.push(`Income changes by ${formatMoney(c.monthlyDelta, { signed: true })} a month starting in ${c.startInYears} years.`);
        }
        break;
      }
      case "child": {
        const cost = c.monthlyCost ?? next.facts.childCostMonthly ?? DEFAULT_CHILD_COST_MONTHLY;
        const ev: LifeEvent = { ...childEvent(c.inYears, cost), years: c.years ?? 18 };
        next.events.push(ev);
        assumptions.push(
          `A child in ${c.inYears} year${c.inYears === 1 ? "" : "s"} costs ${formatMoney(cost)} a month for ${ev.years} years${c.monthlyCost || next.facts.childCostMonthly ? "" : " (USDA middle-income estimate, including childcare)"}.`,
          "Those costs reduce what you can invest while they last.",
        );
        break;
      }
      case "retirement_spending":
        next.facts.retirementSpendingAnnual = Math.max(0, (next.facts.retirementSpendingAnnual ?? next.monthlySpending * 12) + c.annualDelta);
        assumptions.push(`Retirement spending of ${formatMoney(next.facts.retirementSpendingAnnual)} a year.`);
        break;
      case "travel": {
        const monthly = Math.round(c.annualDelta / 12);
        next.monthlySpending += monthly;
        next.travelMonthly += monthly;
        next.investingMonthly = Math.max(0, next.investingMonthly - monthly);
        next.facts.travelBudgetAnnual = Math.max(0, (next.facts.travelBudgetAnnual ?? inputs.travelMonthly * 12) + c.annualDelta);
        next.facts.retirementSpendingAnnual = Math.max(0, (next.facts.retirementSpendingAnnual ?? inputs.monthlySpending * 12) + c.annualDelta);
        assumptions.push(
          `${formatMoney(Math.abs(c.annualDelta))} ${c.annualDelta >= 0 ? "more" : "less"} a year on travel, now and in retirement.`,
          "It comes out of what you invest each month.",
        );
        break;
      }
      case "one_time":
        next.events.push({ label: c.label, startYear: c.inYears, years: 0, oneTime: c.amount });
        assumptions.push(`${c.label}: ${formatMoney(c.amount, { signed: true })} in ${c.inYears} year${c.inYears === 1 ? "" : "s"}.`);
        break;
    }
  }
  return { inputs: next, assumptions };
}

function fiYears(v: GoalView): number | null {
  return v.fi?.monteCarlo.yearsP50 ?? null;
}

export function runScenario(
  title: string,
  inputs: PlanInputs,
  goals: GoalRecord[],
  changes: ScenarioChange[],
  current: { allocations: Map<string, Minor>; reserves: Map<string, Minor>; connectedInvestments: boolean },
): ScenarioResult {
  const project = (pi: PlanInputs) =>
    goals.map((g) =>
      projectGoal(g, pi, current.allocations.get(g.id) ?? 0, {
        reservesForGoal: current.reserves.get(g.id) ?? 0,
        connectedInvestments: current.connectedInvestments,
      }),
    );
  const before = project(inputs);
  const applied = applyChanges(inputs, changes);
  const after = project(applied.inputs);
  const deltas = before.map((b, i) => {
    const a = after[i]!;
    const yb = fiYears(b);
    const ya = fiYears(a);
    const months =
      b.projectedDate && a.projectedDate
        ? (Number(a.projectedDate.slice(0, 4)) - Number(b.projectedDate.slice(0, 4))) * 12 + Number(a.projectedDate.slice(5, 7)) - Number(b.projectedDate.slice(5, 7))
        : null;
    return {
      goalId: b.id,
      title: b.title,
      before: b.headline,
      after: a.headline,
      changeYears: yb != null && ya != null ? Math.round((ya - yb) * 10) / 10 : null,
      changeMonths: months,
    };
  });
  const surplus = (pi: PlanInputs) => pi.monthlyIncome - pi.monthlySpending;
  return {
    title,
    assumptions: applied.assumptions,
    before,
    after,
    monthlySurplusBefore: surplus(inputs),
    monthlySurplusAfter: surplus(applied.inputs),
    deltas,
  };
}
