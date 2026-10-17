import type { Minor } from "./money";

/**
 * Financial-independence model. Everything is in today's dollars with *real*
 * (after-inflation) returns, so no separate inflation term is needed for the
 * projection itself. See docs/FINANCIAL_CALCULATIONS.md for sources and limits.
 */
export interface LifeEvent {
  label: string;
  startYear: number; // years from now
  years: number | null; // duration; null = permanent
  monthlyContributionDelta?: Minor; // e.g. child costs reduce what can be invested
  oneTime?: Minor; // signed, applied at startYear (negative = withdrawal from portfolio)
  retirementSpendingDelta?: Minor; // annual, today's dollars
}

export interface FiInputs {
  currentAge: number | null;
  investable: Minor;
  /** Fraction of investable assets in tax-advantaged retirement accounts. */
  retirementShare: number;
  monthlyContribution: Minor; // invested each month
  /** Surplus that stays in the bank each month; counts toward independence but earns no real return. */
  cashContribution?: Minor;
  annualSpending: Minor; // in retirement, today's dollars
  socialSecurityAnnual?: Minor | null;
  socialSecurityAge?: number;
  taxRate?: number; // effective rate on withdrawals
  events?: LifeEvent[];
}

export interface Assumptions {
  name: "conservative" | "base" | "optimistic";
  realReturn: number;
  withdrawalRate: number;
}

export const SCENARIOS: Assumptions[] = [
  { name: "conservative", realReturn: 0.03, withdrawalRate: 0.0325 },
  { name: "base", realReturn: 0.045, withdrawalRate: 0.0375 },
  { name: "optimistic", realReturn: 0.06, withdrawalRate: 0.0425 },
];

export const MC_VOLATILITY = 0.12; // annual σ of log real returns, diversified stock/bond mix
export const DEFAULT_TAX_RATE = 0.1;
export const ACCESS_AGE = 59.5;
const MAX_YEARS = 60;

function yearsToMonths(y: number) {
  return Math.round(y * 12);
}

/** Monthly flows into each bucket. Life-event costs come out of uninvested cash first. */
function contributionAt(inputs: FiInputs, month: number): { invest: Minor; cash: Minor } {
  let delta = 0;
  for (const e of inputs.events ?? []) {
    const start = yearsToMonths(e.startYear);
    const end = e.years == null ? Infinity : start + yearsToMonths(e.years);
    if (month >= start && month < end) delta += e.monthlyContributionDelta ?? 0;
  }
  let invest = inputs.monthlyContribution;
  let cash = inputs.cashContribution ?? 0;
  if (delta < 0) {
    const fromCash = Math.min(cash, -delta);
    cash -= fromCash;
    invest += delta + fromCash;
  } else invest += delta;
  return { invest, cash };
}

function retirementSpendingAt(inputs: FiInputs, month: number): Minor {
  let s = inputs.annualSpending;
  for (const e of inputs.events ?? []) {
    const start = yearsToMonths(e.startYear);
    const end = e.years == null ? Infinity : start + yearsToMonths(e.years);
    if (month >= start && month < end) s += e.retirementSpendingDelta ?? 0;
  }
  return Math.max(0, s);
}

/**
 * Portfolio needed to sustain spending at a given withdrawal rate, net of tax.
 * With Social Security: the benefit-adjusted gap is funded perpetually, and the
 * years before benefits start are funded in full (present value of an annuity).
 */
export function requiredPortfolio(inputs: FiInputs, a: Assumptions, month: number): Minor {
  const tax = inputs.taxRate ?? DEFAULT_TAX_RATE;
  const gross = retirementSpendingAt(inputs, month) / (1 - tax);
  const ss = inputs.socialSecurityAnnual ?? 0;
  if (ss <= 0 || inputs.currentAge == null) return Math.max(0, Math.round(gross / a.withdrawalRate));
  const ageAt = inputs.currentAge + month / 12;
  const wait = Math.max(0, (inputs.socialSecurityAge ?? 67) - ageAt);
  const covered = Math.min(ss, gross);
  const bridge = a.realReturn > 0 ? (covered * (1 - (1 + a.realReturn) ** -wait)) / a.realReturn : covered * wait;
  return Math.max(0, Math.round((gross - covered) / a.withdrawalRate + bridge));
}

export interface FiPath {
  months: number | null;
  portfolioAtFi: Minor | null;
  requiredAtFi: Minor | null;
}

/** Deterministic month-by-month accumulation until the portfolio covers spending. */
export function simulateFi(inputs: FiInputs, a: Assumptions, annualReturns?: number[]): FiPath {
  let p = inputs.investable;
  let cash = 0;
  for (let m = 0; m <= MAX_YEARS * 12; m++) {
    const req = requiredPortfolio(inputs, a, m);
    if (p + cash >= req) {
      return { months: m, portfolioAtFi: Math.round(p + cash), requiredAtFi: req };
    }
    const yearly = annualReturns ? annualReturns[Math.floor(m / 12)] ?? a.realReturn : a.realReturn;
    const r = (1 + yearly) ** (1 / 12) - 1;
    const c = contributionAt(inputs, m);
    p = p * (1 + r) + c.invest;
    cash += c.cash;
    for (const e of inputs.events ?? []) if (e.oneTime && yearsToMonths(e.startYear) === m) cash += e.oneTime;
    if (cash < 0) {
      p += cash;
      cash = 0;
    }
    if (p < 0) p = 0;
  }
  return { months: null, portfolioAtFi: null, requiredAtFi: null };
}

/** Deterministic PRNG (mulberry32) so projections are reproducible. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand: () => number) {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export interface MonteCarlo {
  paths: number;
  reachedShare: number; // share of paths reaching FI within the horizon
  yearsP10: number | null;
  yearsP25: number | null;
  yearsP50: number | null;
  yearsP75: number | null;
  yearsP90: number | null;
}

export function monteCarloFi(inputs: FiInputs, paths = 1000, seed = 42, vol = MC_VOLATILITY): MonteCarlo {
  const base = SCENARIOS[1]!;
  const rand = rng(seed);
  const mu = Math.log(1 + base.realReturn);
  const years: number[] = [];
  for (let i = 0; i < paths; i++) {
    const returns = Array.from({ length: MAX_YEARS + 1 }, () => Math.exp(mu + vol * normal(rand)) - 1);
    const r = simulateFi(inputs, base, returns);
    if (r.months != null) years.push(r.months / 12);
  }
  years.sort((a, b) => a - b);
  // Paths that never reach FI sort to the end: percentiles beyond the reached share are null.
  const at = (p: number) => (p <= years.length / paths ? percentile(years, (p * paths) / Math.max(1, years.length)) : null);
  const round = (x: number | null) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10) / 10);
  return {
    paths,
    reachedShare: years.length / paths,
    yearsP10: round(at(0.1)),
    yearsP25: round(at(0.25)),
    yearsP50: round(at(0.5)),
    yearsP75: round(at(0.75)),
    yearsP90: round(at(0.9)),
  };
}

/** Probability the portfolio lasts `years` while withdrawing spending (sequence-of-returns risk). */
export function sustainability(portfolio: Minor, inputs: FiInputs, years: number, paths = 1000, seed = 7, vol = MC_VOLATILITY, startAge: number | null = inputs.currentAge): number {
  const base = SCENARIOS[1]!;
  const rand = rng(seed);
  const mu = Math.log(1 + base.realReturn);
  const tax = inputs.taxRate ?? DEFAULT_TAX_RATE;
  const ss = inputs.socialSecurityAnnual ?? 0;
  let survived = 0;
  for (let i = 0; i < paths; i++) {
    let p = portfolio;
    let ok = true;
    for (let y = 0; y < years; y++) {
      const age = startAge != null ? startAge + y : null;
      const benefit = age != null && age >= (inputs.socialSecurityAge ?? 67) ? ss : 0;
      p -= Math.max(0, inputs.annualSpending / (1 - tax) - benefit);
      if (p <= 0) {
        ok = false;
        break;
      }
      p *= Math.exp(mu + vol * normal(rand));
    }
    if (ok) survived++;
  }
  return survived / paths;
}

export interface FiProjection {
  scenarios: { name: Assumptions["name"]; years: number | null; age: number | null; required: Minor }[];
  monteCarlo: MonteCarlo;
  window: { fromYears: number; toYears: number; fromAge: number | null; toAge: number | null } | null;
  requiredToday: Minor;
  progress: number; // investable / required (base)
  successAtBase: number | null; // probability money lasts to 95 (or 45 years) retiring at the base date
  accessNote: string | null;
  sensitivity: { label: string; deltaYears: number | null }[];
}

function ageOf(inputs: FiInputs, years: number | null) {
  return inputs.currentAge != null && years != null ? Math.round((inputs.currentAge + years) * 10) / 10 : null;
}

export function projectFi(inputs: FiInputs, opts: { paths?: number; sensitivity?: boolean } = {}): FiProjection {
  const scenarios = SCENARIOS.map((a) => {
    const r = simulateFi(inputs, a);
    const years = r.months == null ? null : Math.round((r.months / 12) * 10) / 10;
    return { name: a.name, years, age: ageOf(inputs, years), required: requiredPortfolio(inputs, a, 0) };
  });
  const mc = monteCarloFi(inputs, opts.paths ?? 1000);
  const window =
    mc.yearsP25 != null && mc.yearsP75 != null
      ? { fromYears: mc.yearsP25, toYears: mc.yearsP75, fromAge: ageOf(inputs, mc.yearsP25), toAge: ageOf(inputs, mc.yearsP75) }
      : null;
  const requiredToday = scenarios[1]!.required;
  const base = scenarios[1]!;

  let successAtBase: number | null = null;
  let accessNote: string | null = null;
  if (base.years != null) {
    const path = simulateFi(inputs, SCENARIOS[1]!);
    const horizon = inputs.currentAge != null ? Math.max(20, Math.round(95 - (inputs.currentAge + base.years))) : 45;
    const retireAge = inputs.currentAge != null ? inputs.currentAge + base.years : null;
    successAtBase = Math.round(sustainability(path.portfolioAtFi!, inputs, horizon, Math.min(opts.paths ?? 1000, 1000), 7, MC_VOLATILITY, retireAge) * 100) / 100;
    if (inputs.currentAge != null && inputs.currentAge + base.years < ACCESS_AGE && inputs.retirementShare > 0.5) {
      const bridgeYears = Math.ceil(ACCESS_AGE - (inputs.currentAge + base.years));
      accessNote = `Most of your investments are in retirement accounts. Retiring before ${ACCESS_AGE} means bridging about ${bridgeYears} years with taxable savings or early-access strategies.`;
    }
  }

  const sensitivity: FiProjection["sensitivity"] = [];
  if (opts.sensitivity !== false && base.years != null) {
    const variants: [string, FiInputs][] = [
      [
        "Invest $250 more a month",
        { ...inputs, monthlyContribution: inputs.monthlyContribution + 250_00, cashContribution: Math.max(0, (inputs.cashContribution ?? 0) - 250_00) },
      ],
      ["Spend 10% less in retirement", { ...inputs, annualSpending: Math.round(inputs.annualSpending * 0.9) }],
      ["Spend 10% more in retirement", { ...inputs, annualSpending: Math.round(inputs.annualSpending * 1.1) }],
    ];
    for (const [label, v] of variants) {
      const r = simulateFi(v, SCENARIOS[1]!);
      sensitivity.push({ label, deltaYears: r.months == null ? null : Math.round((r.months / 12 - base.years) * 10) / 10 });
    }
    const lowR = simulateFi(inputs, { ...SCENARIOS[1]!, realReturn: SCENARIOS[1]!.realReturn - 0.01 });
    sensitivity.push({ label: "Returns 1% lower", deltaYears: lowR.months == null ? null : Math.round((lowR.months / 12 - base.years) * 10) / 10 });
  }

  return {
    scenarios,
    monteCarlo: mc,
    window,
    requiredToday,
    progress: requiredToday > 0 ? Math.min(1, inputs.investable / requiredToday) : 1,
    successAtBase,
    accessNote,
    sensitivity,
  };
}

/** Year-by-year portfolio (investments + retained cash) under one scenario, for charts. */
export function trajectory(inputs: FiInputs, a: Assumptions, years: number): { year: number; value: Minor; required: Minor }[] {
  const out: { year: number; value: Minor; required: Minor }[] = [];
  let p = inputs.investable;
  let cash = 0;
  const r = (1 + a.realReturn) ** (1 / 12) - 1;
  for (let m = 0; m <= years * 12; m++) {
    if (m % 12 === 0) out.push({ year: m / 12, value: Math.round(p + cash), required: requiredPortfolio(inputs, a, m) });
    const c = contributionAt(inputs, m);
    p = p * (1 + r) + c.invest;
    cash += c.cash;
    for (const e of inputs.events ?? []) if (e.oneTime && Math.round(e.startYear * 12) === m) cash += e.oneTime;
    if (cash < 0) {
      p += cash;
      cash = 0;
    }
    if (p < 0) p = 0;
  }
  return out;
}
