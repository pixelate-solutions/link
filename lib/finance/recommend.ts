import { type CategoryId, categoryLabel } from "./categories";
import { addDays, daysBetween } from "./dates";
import { amortize, interestBearing } from "./debt";
import { formatMoney, type Minor } from "./money";
import { formatMonthYear, type GoalRecord, type Picture, type PlanInputs, type Preferences } from "./plan";
import { runScenario, type ScenarioChange } from "./scenario";

export type RecommendationKind =
  | "cash_shortfall"
  | "build_reserve"
  | "pay_high_interest"
  | "invest_surplus"
  | "spending_drift"
  | "new_subscription"
  | "goal_gap"
  | "idle_cash";

export type RecommendationAction =
  | { type: "budget"; category: CategoryId; monthly: Minor }
  | { type: "scenario"; changes: ScenarioChange[] }
  | { type: "move_money"; amount: Minor; from: string; to: string }
  | { type: "commit_savings"; monthly: Minor }
  | { type: "info" };

export interface RecommendationDraft {
  fingerprint: string;
  kind: RecommendationKind;
  title: string;
  detail: string;
  impact: {
    monthly?: Minor;
    annual?: Minor;
    interestSaved?: Minor;
    goal?: { goalId: string; title: string; before: string; after: string; changeYears?: number | null; changeMonths?: number | null };
  };
  evidence: { label: string; value: string }[];
  assumptions: string[];
  tradeoffs?: string;
  goalIds: string[];
  confidence: number;
  urgency: number; // 0..1
  effort: number; // 0..1
  action: RecommendationAction;
  /** Monthly-equivalent impact used to decide whether a dismissed item has materially changed. */
  basis: Minor;
  score: number;
}

interface Ctx {
  picture: Picture;
  inputs: PlanInputs;
  goals: GoalRecord[];
  prefs: Preferences;
}

function primaryGoal(ctx: Ctx) {
  return [...ctx.goals].sort((a, b) => a.priority - b.priority)[0] ?? null;
}

/** Re-project the primary goal under a change, using the same scenario engine as the Plan screen. */
function goalImpact(ctx: Ctx, changes: ScenarioChange[]) {
  const g = primaryGoal(ctx);
  if (!g) return undefined;
  const contributions = new Map(ctx.picture.goals.map((v) => [v.id, v.contributionMonthly]));
  const reserves = new Map(ctx.picture.goals.map((v) => [v.id, v.savedAmount ?? 0]));
  const r = runScenario("impact", ctx.inputs, [g], changes, {
    contributions,
    reserves,
    connectedInvestments: ctx.picture.position.investmentsKnown,
  });
  const d = r.deltas[0];
  if (!d || d.before === d.after) return undefined;
  return { goal: { goalId: g.id, title: g.title, before: d.before, after: d.after, changeYears: d.changeYears, changeMonths: d.changeMonths }, assumptions: r.assumptions };
}

function describeGoalChange(goal: NonNullable<RecommendationDraft["impact"]["goal"]>): string {
  let delta = "";
  if (goal.changeYears) {
    const months = Math.round(Math.abs(goal.changeYears) * 12);
    const span = months >= 18 ? `${Math.round(Math.abs(goal.changeYears) * 10) / 10} years` : `${months} months`;
    delta = `, about ${span} ${goal.changeYears < 0 ? "sooner" : "later"}`;
  } else if (goal.changeMonths) {
    const m = Math.abs(goal.changeMonths);
    delta = `, ${m} month${m === 1 ? "" : "s"} ${goal.changeMonths < 0 ? "sooner" : "later"}`;
  }
  return `${goal.title}: ${goal.before.replace(/^Age/, "age")} → ${goal.after.replace(/^Age/, "age")}${delta}.`;
}

function cashShortfall(ctx: Ctx): RecommendationDraft[] {
  const { forecast, position, safeToSpend } = ctx.picture;
  const s = forecast.shortfall;
  if (!s || daysBetween(ctx.picture.asOf, s.date) > 30 || safeToSpend.status === "unavailable") return [];
  const need = Math.ceil((s.amount + 50_00) / 50_00) * 50_00;
  const fromReserves = position.reserves >= need;
  return [
    {
      fingerprint: `cash_shortfall:${s.date.slice(0, 7)}`,
      kind: "cash_shortfall",
      title: fromReserves ? `Move ${formatMoney(need)} to checking before ${formatShort(s.date)}` : `Checking may run short by ${formatMoney(s.amount)} around ${formatShort(s.date)}`,
      detail: fromReserves ? "Upcoming bills are projected to exceed your checking balance." : `Hold back about ${formatMoney(need)} of optional spending until then.`,
      impact: { monthly: s.amount },
      evidence: [
        { label: "Projected low point", value: `${formatMoney(forecast.lowest.expected)} on ${formatShort(forecast.lowest.date)}` },
        { label: "Spendable cash now", value: formatMoney(position.cash) },
      ],
      assumptions: ["Based on detected recurring bills and your typical day-to-day spending."],
      goalIds: [],
      confidence: 0.75,
      urgency: 1,
      effort: 0.2,
      action: fromReserves ? { type: "move_money", amount: need, from: "savings", to: "checking" } : { type: "info" },
      basis: s.amount,
      score: 0,
    },
  ];
}

function buildReserve(ctx: Ctx): RecommendationDraft[] {
  const { inputs } = ctx;
  const essential = inputs.essentialSpending;
  if (essential <= 0) return [];
  const months = inputs.reserves / essential;
  const target = inputs.facts.emergencyMonths ?? 3;
  if (months >= Math.min(target, 3)) return [];
  const surplus = inputs.monthlyIncome - inputs.monthlySpending - inputs.investingMonthly - inputs.savingsMonthly;
  if (surplus <= 50_00) return [];
  const gap = target * essential - inputs.reserves;
  const planned = ctx.picture.allocations.find((a) => a.target === "reserve")?.monthly ?? 0;
  const monthly = Math.ceil(Math.min(gap, planned || surplus * 0.3) / 25_00) * 25_00;
  if (monthly <= 0) return [];
  const reach = Math.ceil(gap / monthly);
  const goal = ctx.goals.find((g) => g.kind === "emergency_fund" || g.kind === "stability");
  return [
    {
      fingerprint: "build_reserve",
      kind: "build_reserve",
      title: reach <= 1 ? `Move ${formatMoney(monthly)} into savings for emergencies` : `Set aside ${formatMoney(monthly)} a month for emergencies`,
      detail: `${reach <= 1 ? "That completes" : `Reaches ${target} months of essentials by ${formatMonthYear(addDays(ctx.picture.asOf, reach * 30))}, completing`} a ${target}-month emergency reserve. You have ${months.toFixed(1)} months now.`,
      impact: { monthly, annual: monthly * 12 },
      evidence: [
        { label: "Essential spending", value: `${formatMoney(essential)}/mo` },
        { label: "Savings balance", value: formatMoney(inputs.reserves) },
        { label: "Unassigned surplus", value: `${formatMoney(surplus)}/mo` },
      ],
      assumptions: [`Target is ${target} months of essential spending.`],
      tradeoffs: "Money set aside here isn't invested, which is the point: it has to be there when you need it.",
      goalIds: goal ? [goal.id] : [],
      confidence: 0.85,
      urgency: months < 1 ? 0.8 : 0.5,
      effort: 0.2,
      action: { type: "commit_savings", monthly },
      basis: monthly,
      score: 0,
    },
  ];
}

function payHighInterest(ctx: Ctx): RecommendationDraft[] {
  const out: RecommendationDraft[] = [];
  const surplus = ctx.inputs.monthlyIncome - ctx.inputs.monthlySpending - ctx.inputs.investingMonthly - ctx.inputs.savingsMonthly;
  for (const d of ctx.inputs.debts.filter(interestBearing)) {
    if (d.balance < 200_00 || d.kind === "mortgage") continue;
    const min = d.minPayment ?? Math.max(25_00, Math.round(d.balance * 0.02));
    if (d.aprBps == null) {
      out.push({
        fingerprint: `debt_rate_unknown:${d.id}`,
        kind: "pay_high_interest",
        title: `Add the interest rate for ${d.name}`,
        detail: `Link can't tell whether paying down ${formatMoney(d.balance)} beats investing without it.`,
        impact: {},
        evidence: [{ label: "Balance", value: formatMoney(d.balance) }],
        assumptions: ["Interest rates are never guessed."],
        goalIds: [],
        confidence: 0.5,
        urgency: 0.3,
        effort: 0.1,
        action: { type: "info" },
        basis: 0,
        score: 0,
      });
      continue;
    }
    if (d.aprBps < 800 || surplus <= 50_00) continue;
    const extra = Math.max(50_00, Math.round(Math.min(surplus * 0.6, d.balance / 6) / 25_00) * 25_00);
    const base = amortize(d.balance, d.aprBps, min);
    const faster = amortize(d.balance, d.aprBps, min + extra);
    if (faster.months == null) continue;
    const saved = base.months == null ? null : base.totalInterest - faster.totalInterest;
    const goal = ctx.goals.find((g) => g.kind === "debt_freedom");
    out.push({
      fingerprint: `pay_high_interest:${d.id}`,
      kind: "pay_high_interest",
      title: `Pay ${formatMoney(extra)} more a month on ${d.name}`,
      detail:
        saved != null
          ? `Paid off in ${faster.months} months instead of ${base.months}, saving about ${formatMoney(saved)} in interest.`
          : `Paid off in ${faster.months} months. At the minimum alone, the balance never clears.`,
      impact: { monthly: extra, interestSaved: saved ?? undefined, annual: saved != null && base.months ? Math.round((saved / base.months) * 12) : undefined },
      evidence: [
        { label: "Balance", value: formatMoney(d.balance) },
        { label: "Interest rate", value: `${(d.aprBps / 100).toFixed(2)}%` },
        { label: "Minimum payment", value: formatMoney(min) },
      ],
      assumptions: ["No new charges on this card while paying it down."],
      tradeoffs: `At ${(d.aprBps / 100).toFixed(1)}%, every dollar here earns more than expected investment returns.`,
      goalIds: goal ? [goal.id] : [],
      confidence: 0.9,
      urgency: d.aprBps >= 1500 ? 0.7 : 0.45,
      effort: 0.2,
      action: { type: "info" },
      basis: extra,
      score: 0,
    });
  }
  return out;
}

function investSurplus(ctx: Ctx): RecommendationDraft[] {
  const fiGoal = ctx.goals.find((g) => g.kind === "financial_independence" || g.kind === "wealth");
  if (!fiGoal) return [];
  if (ctx.inputs.debts.some((d) => interestBearing(d) && (d.aprBps ?? 0) >= 800)) return [];
  const planned = ctx.picture.allocations.filter((a) => a.target === fiGoal.id).reduce((s, a) => s + a.monthly, 0);
  const amount = Math.floor((planned || ctx.picture.flows.surplusUnassigned * 0.6) / 25_00) * 25_00;
  if (amount < 50_00) return [];
  const impact = goalImpact(ctx, [{ type: "investing", monthlyDelta: amount }]);
  return [
    {
      fingerprint: "invest_surplus",
      kind: "invest_surplus",
      title: `Invest ${formatMoney(amount)} more each month`,
      detail: impact ? describeGoalChange(impact.goal) : `That's ${formatMoney(amount * 12)} a year working toward ${fiGoal.title.toLowerCase()}.`,
      impact: { monthly: amount, annual: amount * 12, goal: impact?.goal },
      evidence: [
        { label: "Typical income", value: `${formatMoney(ctx.inputs.monthlyIncome)}/mo` },
        { label: "Typical spending", value: `${formatMoney(ctx.inputs.monthlySpending)}/mo` },
        { label: "Investing now", value: `${formatMoney(ctx.inputs.investingMonthly)}/mo` },
        { label: "Staying in your bank", value: `${formatMoney(ctx.inputs.cashRetainedMonthly)}/mo` },
      ],
      assumptions: impact?.assumptions ?? [],
      tradeoffs: "Invested money can fall in value and may be harder to reach before retirement age.",
      goalIds: [fiGoal.id],
      confidence: 0.8,
      urgency: 0.35,
      effort: 0.25,
      action: { type: "scenario", changes: [{ type: "investing", monthlyDelta: amount }] },
      basis: amount,
      score: 0,
    },
  ];
}

function spendingDrift(ctx: Ctx): RecommendationDraft[] {
  const out: RecommendationDraft[] = [];
  const protectedCats = new Set<CategoryId>([...ctx.prefs.protectedCategories, ...ctx.goals.flatMap((g) => g.interpretation.protectedCategories)]);
  for (const c of ctx.picture.baseline.categories) {
    // "Other spending" is a catch-all, not a habit Link can name.
    if (c.group !== "discretionary" || c.category === "general" || protectedCats.has(c.category) || c.irregular || c.months.length < 3) continue;
    const recent = c.months.slice(-2);
    const earlier = c.months.slice(0, -2);
    const recentAvg = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
    const earlierAvg = Math.round(earlier.reduce((a, b) => a + b, 0) / earlier.length);
    const increase = recentAvg - earlierAvg;
    if (increase < 100_00 || increase < earlierAvg * 0.25) continue;
    // Sustained, not a one-off: every recent month must be clearly above the earlier level.
    if (Math.min(...recent) < earlierAvg + increase * 0.5) continue;
    const reduceBy = Math.round(increase / 5_00) * 5_00;
    const impact = goalImpact(ctx, [{ type: "spending", monthlyDelta: -reduceBy, category: c.category, redirect: "invest" }]);
    const label = categoryLabel(c.category);
    out.push({
      fingerprint: `spending_drift:${c.category}`,
      kind: "spending_drift",
      title: `Bring ${label.toLowerCase()} back to ${formatMoney(earlierAvg)} a month`,
      detail: `It's up ${formatMoney(increase)} a month lately. Going back to your usual frees ${formatMoney(reduceBy * 12)} a year.${impact ? " " + describeGoalChange(impact.goal) : ""}`,
      impact: { monthly: reduceBy, annual: reduceBy * 12, goal: impact?.goal },
      evidence: [
        { label: `${label}, last 2 months`, value: `${formatMoney(recentAvg)}/mo` },
        { label: `${label}, before that`, value: `${formatMoney(earlierAvg)}/mo` },
      ],
      assumptions: impact ? impact.assumptions : [],
      tradeoffs: ctx.prefs.lifestyleWeight >= 60 ? "You've said lifestyle matters to you; this only returns to what you spent before." : undefined,
      goalIds: impact ? [impact.goal.goalId] : [],
      confidence: 0.8,
      urgency: 0.4,
      effort: 0.55,
      action: { type: "budget", category: c.category, monthly: Math.ceil(earlierAvg / 10_00) * 10_00 },
      basis: reduceBy,
      score: 0,
    });
  }
  return out;
}

function newSubscriptions(ctx: Ctx): RecommendationDraft[] {
  const out: RecommendationDraft[] = [];
  for (const s of ctx.picture.recurring) {
    if (s.amount >= 0 || (s.kind !== "subscription" && s.kind !== "bill")) continue;
    const firstSeenDays = daysBetween(s.firstDate, ctx.picture.asOf);
    const monthly = s.cadence === "annual" ? Math.round(-s.amount / 12) : s.cadence === "weekly" ? Math.round((-s.amount * 52) / 12) : -s.amount;
    // Only new, material commitments are worth interrupting for.
    if (firstSeenDays > 100 || monthly < 30_00) continue;
    out.push({
      fingerprint: `new_subscription:${s.key}`,
      kind: "new_subscription",
      title: `New ${formatMoney(-s.amount)} ${s.cadence} charge from ${s.merchant}`,
      detail: `That's ${formatMoney(monthly * 12)} a year. Keep it if it's worth it; Link has added it to your plan.`,
      impact: { monthly, annual: monthly * 12 },
      evidence: [
        { label: "Seen", value: `${s.occurrences} times` },
        { label: "Next expected", value: s.nextDate ? formatShort(s.nextDate) : "—" },
      ],
      assumptions: [],
      goalIds: [],
      confidence: s.confidence,
      urgency: 0.3,
      effort: 0.3,
      action: { type: "info" },
      basis: monthly,
      score: 0,
    });
  }
  return out;
}

function goalGaps(ctx: Ctx): RecommendationDraft[] {
  const out: RecommendationDraft[] = [];
  for (const v of ctx.picture.goals) {
    if (v.status !== "behind" || !v.targetAmount || v.savedAmount == null) continue;
    const g = ctx.goals.find((x) => x.id === v.id);
    const due = g?.targetDate ?? g?.interpretation.target.date;
    if (!due) continue;
    const months = Math.max(1, Math.round(daysBetween(ctx.picture.asOf, due) / 30.44));
    const needed = Math.ceil((v.targetAmount - v.savedAmount) / months / 25_00) * 25_00;
    const extra = needed - v.allocationMonthly;
    if (extra <= 0) continue;
    out.push({
      fingerprint: `goal_gap:${v.id}`,
      kind: "goal_gap",
      title: `Save ${formatMoney(extra)} more a month for ${v.title.toLowerCase()}`,
      detail: `That keeps ${formatMonthYear(due)} in reach. Or move the date to ${v.projectedDate ? formatMonthYear(v.projectedDate) : "later"}.`,
      impact: { monthly: extra, annual: extra * 12 },
      evidence: [
        { label: "Saved", value: formatMoney(v.savedAmount) },
        { label: "Target", value: formatMoney(v.targetAmount) },
      ],
      assumptions: v.assumptions,
      goalIds: [v.id],
      confidence: 0.85,
      urgency: 0.55,
      effort: 0.4,
      action: { type: "info" },
      basis: extra,
      score: 0,
    });
  }
  return out;
}

function idleCash(ctx: Ctx): RecommendationDraft[] {
  const { inputs, picture } = ctx;
  const upcoming = picture.forecast.events.filter((e) => e.amount < 0 && daysBetween(picture.asOf, e.date) <= 30).reduce((s, e) => s - e.amount, 0);
  const keep = upcoming + inputs.essentialSpending;
  const idle = inputs.cash - keep;
  if (idle < 2_000_00 || inputs.reserves < inputs.essentialSpending * 3) return [];
  const amount = Math.floor(idle / 500_00) * 500_00;
  return [
    {
      fingerprint: "idle_cash",
      kind: "idle_cash",
      title: `Move ${formatMoney(amount)} out of checking`,
      detail: "It's more than a month of bills and spending, and it isn't earning much there.",
      impact: { monthly: Math.round((amount * 0.04) / 12), annual: Math.round(amount * 0.04) },
      evidence: [
        { label: "Checking", value: formatMoney(inputs.cash) },
        { label: "Needed in the next 30 days", value: formatMoney(keep) },
      ],
      assumptions: ["Assumes about 4% a year in a high-yield savings account."],
      goalIds: [],
      confidence: 0.7,
      urgency: 0.2,
      effort: 0.2,
      action: { type: "move_money", amount, from: "checking", to: "savings" },
      basis: Math.round((amount * 0.04) / 12),
      score: 0,
    },
  ];
}

function formatShort(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!)).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Weighted ranking. Lifestyle weight discounts spending cuts; goal alignment boosts. */
export function score(r: RecommendationDraft, ctx: Ctx): number {
  const annual = Math.abs(r.impact.annual ?? (r.impact.monthly ?? 0) * 12) + (r.impact.interestSaved ?? 0);
  const impact = Math.min(1, Math.log10(1 + annual / 100_00) / 3);
  const primary = primaryGoal(ctx);
  const align = r.goalIds.length === 0 ? 0.3 : primary && r.goalIds.includes(primary.id) ? 1 : 0.6;
  const lifestyle = r.kind === "spending_drift" ? (ctx.prefs.lifestyleWeight / 100) * 0.25 : 0;
  const s = 0.35 * impact + 0.25 * r.urgency + 0.2 * align + 0.1 * r.confidence + 0.1 * (1 - r.effort) - lifestyle;
  return Math.round(s * 1000) / 1000;
}

export function generateRecommendations(ctx: Ctx): RecommendationDraft[] {
  const all = [
    ...cashShortfall(ctx),
    ...buildReserve(ctx),
    ...payHighInterest(ctx),
    ...investSurplus(ctx),
    ...spendingDrift(ctx),
    ...newSubscriptions(ctx),
    ...goalGaps(ctx),
    ...idleCash(ctx),
  ];
  for (const r of all) r.score = score(r, ctx);
  return all.sort((a, b) => b.score - a.score);
}

/** A dismissed recommendation resurfaces only after a material change in its impact. */
export function shouldResurface(prevBasis: Minor, nextBasis: Minor, dismissedAt: Date, now: Date): boolean {
  const days = (now.getTime() - dismissedAt.getTime()) / 86_400_000;
  if (days < 30) return false;
  if (prevBasis === 0) return nextBasis > 0;
  return Math.abs(nextBasis - prevBasis) / Math.abs(prevBasis) >= 0.5;
}
