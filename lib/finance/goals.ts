import type { CategoryId } from "./categories";
import { addMonths, type ISODate } from "./dates";
import { type Minor, toMinor } from "./money";

export const GOAL_KINDS = [
  "financial_independence",
  "home_purchase",
  "debt_freedom",
  "emergency_fund",
  "savings_target",
  "purchase",
  "family",
  "travel",
  "stability",
  "wealth",
  "business_growth",
  "custom",
] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

/** Planning facts Link may need. Keys are stored in `link.facts`. */
export const FACT_KEYS = [
  "birth_year",
  "retirement_spending_annual",
  "outside_investments",
  "workplace_contribution_monthly",
  "social_security_annual",
  "home_price",
  "travel_budget_annual",
  "children_planned",
  "child_cost_monthly",
  "expected_income_change",
  "emergency_months",
] as const;
export type FactKey = (typeof FACT_KEYS)[number];

export const FACT_QUESTIONS: Record<FactKey, string> = {
  birth_year: "What year were you born?",
  retirement_spending_annual: "Roughly how much would you like to spend each year once you stop working?",
  outside_investments: "Do you have investments that aren't connected, like a workplace 401(k)? Roughly how much?",
  workplace_contribution_monthly: "How much goes into a workplace retirement plan from each month's pay?",
  social_security_annual: "Do you know your estimated annual Social Security benefit?",
  home_price: "About what price home are you thinking of?",
  travel_budget_annual: "How much would you like to spend on travel each year?",
  children_planned: "When might you have a child?",
  child_cost_monthly: "What do you expect a child to cost each month, including childcare?",
  expected_income_change: "Do you expect your household income to change soon?",
  emergency_months: "How many months of essential expenses would you like in reserve?",
};

export interface MissingInput {
  key: FactKey;
  question: string;
  impact: "high" | "medium" | "low";
  why: string;
}

export interface GoalInterpretation {
  kind: GoalKind;
  title: string;
  summary: string;
  metric: string;
  qualifiers: { asap?: boolean; preserveLifestyle?: boolean; flexible?: boolean };
  target: { amount?: Minor; date?: ISODate; age?: number };
  missing: MissingInput[];
  protectedCategories: CategoryId[];
  source: "rules" | "ai";
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, a: 1, an: 1, couple: 2, few: 3,
};

function num(word: string): number | null {
  const n = Number(word.replace(/,/g, ""));
  if (!Number.isNaN(n)) return n;
  return NUMBER_WORDS[word.toLowerCase()] ?? null;
}

export function parseAmount(text: string): Minor | null {
  const m = text.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|m|mm|million)?\b|(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|million)\b/i);
  if (!m) return null;
  const raw = (m[1] ?? m[3])!.replace(/,/g, "");
  const unit = (m[2] ?? m[4] ?? "").toLowerCase();
  const mult = unit === "k" || unit === "thousand" ? 1_000 : unit.startsWith("m") ? 1_000_000 : 1;
  return toMinor(String(Number(raw) * mult));
}

export function parseTiming(text: string, today: ISODate): { date?: ISODate; age?: number } {
  const t = text.toLowerCase();
  const inYears = t.match(/\bin\s+(?:the\s+next\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|a couple of|a few)\s+years?\b/);
  if (inYears) {
    const n = num(inYears[1]!.replace("a couple of", "couple").replace("a few", "few"));
    if (n) return { date: addMonths(today, n * 12) };
  }
  const inMonths = t.match(/\bin\s+(\d+|one|two|three|six|nine|twelve|eighteen)\s+months?\b/);
  if (inMonths) {
    const n = num(inMonths[1]!) ?? 18;
    return { date: addMonths(today, n) };
  }
  const byYear = t.match(/\bby\s+(?:the\s+end\s+of\s+)?(20\d\d)\b/);
  if (byYear) return { date: `${byYear[1]}-12-31` };
  const byAge = t.match(/\b(?:by\s+(?:the\s+time\s+i'?m|age)|before\s+(?:i'?m|age)|at\s+age)\s+(\d{2})\b/);
  if (byAge) return { age: Number(byAge[1]) };
  return {};
}

interface Pattern {
  kind: GoalKind;
  test: RegExp;
}

const PATTERNS: Pattern[] = [
  { kind: "financial_independence", test: /\b(retire|retirement|financial(ly)?\s+(independen|free)|fire\b|stop\s+working|work\s+less|never\s+have\s+to\s+work|quit\s+my\s+job)/i },
  { kind: "home_purchase", test: /\b(buy|purchase|own|afford|save\s+for)\b[^.]*\b(house|home|condo|apartment|place)\b|\bdown\s*payment\b|\bhome\s*owner/i },
  { kind: "debt_freedom", test: /\b(debt|pay\s*off|paying\s*off|credit\s*card\s*balance|student\s*loans?|owe)\b/i },
  { kind: "emergency_fund", test: /\b(emergency\s*fund|rainy\s*day|safety\s*net|cushion|reserve)\b/i },
  { kind: "stability", test: /\b(paycheck\s*to\s*paycheck|stop\s+worrying|less\s+stress|stressed|stable|stability|security|secure|peace\s+of\s+mind|breathing\s+room)\b/i },
  { kind: "family", test: /\b(child|children|kids?|baby|family|college\s+fund|529)\b/i },
  { kind: "travel", test: /\b(travel|vacation|trips?|see\s+the\s+world)\b/i },
  { kind: "business_growth", test: /\b(grow|scale|expand|build)\b[^.]*\b(business|company|llc|practice|agency|studio|shop|side\s*hustle)\b|\bbusiness\s+(revenue|profit|income)\b/i },
  { kind: "wealth", test: /\b(wealth|wealthy|rich|net\s*worth|grow\s+my\s+money|invest(ing)?\s+more)\b/i },
  { kind: "purchase", test: /\b(buy|afford|save\s+for)\b[^.]*\b(car|truck|wedding|ring|boat|renovat\w*|tuition|laptop|bike)\b/i },
];

const TITLES: Record<GoalKind, (q: GoalInterpretation["qualifiers"], text: string) => string> = {
  financial_independence: (q, t) => (/\bwork\s+less\b/i.test(t) ? "Work less" : q.asap || /\bearly\b/i.test(t) ? "Retire early" : "Financial independence"),
  home_purchase: () => "Buy a home",
  debt_freedom: () => "Be debt-free",
  emergency_fund: () => "Emergency reserve",
  savings_target: () => "Savings goal",
  purchase: (_q, t) => {
    const m = t.match(/\b(car|truck|wedding|ring|boat|renovation|tuition|laptop|bike)\b/i);
    return m ? `Afford a ${m[1]!.toLowerCase()}` : "Planned purchase";
  },
  family: () => "Support my family",
  travel: () => "Travel more",
  stability: () => "Financial breathing room",
  wealth: () => "Build wealth",
  business_growth: () => "Grow my business",
  custom: (_q, t) => t.trim().replace(/^i\s+(want|would\s+like)\s+to\s+/i, "").replace(/[.!]+$/, "").slice(0, 48) || "My goal",
};

const SUMMARIES: Record<GoalKind, string> = {
  financial_independence: "Invested assets large enough to cover your spending without a paycheck.",
  home_purchase: "A down payment and closing costs saved, with a monthly payment that fits.",
  debt_freedom: "Every balance paid off, highest-cost debt first.",
  emergency_fund: "Several months of essential expenses held in cash.",
  savings_target: "A specific amount saved by a specific time.",
  purchase: "Money set aside so the purchase doesn't disrupt your plan.",
  family: "Room in your plan for the costs of a growing family.",
  travel: "A travel budget you can spend without guilt.",
  stability: "A cash cushion and a positive monthly surplus.",
  wealth: "Net worth growing steadily through saving and investing.",
  business_growth: "A business that earns more each year and funds your other goals.",
  custom: "Link will track this alongside your other goals.",
};

const METRICS: Record<GoalKind, string> = {
  financial_independence: "Projected independence age",
  home_purchase: "Down payment saved",
  debt_freedom: "Projected debt-free date",
  emergency_fund: "Months of expenses covered",
  savings_target: "Amount saved",
  purchase: "Amount saved",
  family: "Monthly room in your plan",
  travel: "Travel budget funded",
  stability: "Months of breathing room",
  wealth: "Net worth trend",
  business_growth: "Monthly profit",
  custom: "Progress",
};

function missingFor(kind: GoalKind, target: GoalInterpretation["target"]): MissingInput[] {
  const m = (key: FactKey, impact: MissingInput["impact"], why: string): MissingInput => ({ key, question: FACT_QUESTIONS[key], impact, why });
  switch (kind) {
    case "financial_independence":
      return [
        m("birth_year", "high", "Turns the projection into an age and sets when retirement accounts become accessible."),
        m("outside_investments", "high", "Unconnected investments can move the date by years."),
        m("retirement_spending_annual", "medium", "Assumed equal to your current spending until you say otherwise."),
        m("workplace_contribution_monthly", "medium", "Payroll contributions never appear in your bank data."),
        m("social_security_annual", "low", "Not counted unless you provide an estimate."),
      ];
    case "home_purchase":
      return target.amount ? [] : [m("home_price", "high", "Sets the down payment target.")];
    case "travel":
      return [m("travel_budget_annual", "medium", "Defaults to what you've spent on travel recently.")];
    case "family":
      return [m("children_planned", "high", "Timing determines when costs begin."), m("child_cost_monthly", "medium", "A national average is used until you say otherwise.")];
    case "emergency_fund":
      return [m("emergency_months", "low", "Defaults to 6 months, or 3 if your income is very steady.")];
    default:
      return [];
  }
}

function protectedFor(kind: GoalKind): CategoryId[] {
  return kind === "travel" ? ["travel"] : [];
}

/** Split compound statements like "retire early, but also buy a bigger home and travel". */
function clauses(text: string): string[] {
  return text
    .split(/\b(?:but\s+also|and\s+also|as\s+well\s+as|while\s+also)\b|;|\.\s+/i)
    .flatMap((c) => c.split(/,\s*(?=(?:and\s+)?(?:i\s+)?(?:want|would|also|buy|travel|pay|save|have|retire)\b)|\s+and\s+(?=(?:i\s+)?(?:want\s+to\s+)?(?:buy|travel|pay|save|have|retire|own|get)\b)/i))
    .map((c) => c.trim())
    .filter((c) => c.length > 2);
}

/**
 * Deterministic interpretation of a free-form goal statement. Always returns
 * at least one goal. The AI layer may refine this, but the product works
 * without it.
 */
export function interpretGoals(text: string, today: ISODate): GoalInterpretation[] {
  const qualifiers: GoalInterpretation["qualifiers"] = {
    asap: /\b(as\s+soon\s+as\s+possible|asap|early|earlier|sooner|quickly|fast)\b/i.test(text),
    preserveLifestyle:
      /\b(without\s+(completely\s+)?(sacrific|giving\s+up|cutting)|enjoy(ing)?\s+(life|myself)|lifestyle|not\s+miserable|still\s+(have\s+fun|live))/i.test(text) ||
      /\brather\b.*\b(later|slower)\b.*\b(travel|enjoy|fun|live)/i.test(text),
    flexible: /\b(eventually|someday|one\s+day|at\s+some\s+point)\b/i.test(text),
  };
  const seen = new Set<GoalKind>();
  const out: GoalInterpretation[] = [];
  for (const clause of clauses(text)) {
    let kind: GoalKind | null = null;
    for (const p of PATTERNS) {
      if (p.test.test(clause) && !seen.has(p.kind)) {
        kind = p.kind;
        break;
      }
    }
    const amount = parseAmount(clause);
    if (!kind && amount) kind = "savings_target";
    // A lifestyle qualifier ("without sacrificing my lifestyle") is a preference, not its own goal.
    if (!kind) continue;
    seen.add(kind);
    const timing = parseTiming(clause, today);
    const target = { ...(amount ? { amount } : {}), ...timing };
    out.push({
      kind,
      title: TITLES[kind](qualifiers, clause),
      summary: SUMMARIES[kind],
      metric: METRICS[kind],
      qualifiers,
      target,
      missing: missingFor(kind, target),
      protectedCategories: protectedFor(kind),
      source: "rules",
    });
  }
  if (!out.length) {
    out.push({
      kind: "custom",
      title: TITLES.custom(qualifiers, text),
      summary: SUMMARIES.custom,
      metric: METRICS.custom,
      qualifiers,
      target: {},
      missing: [],
      protectedCategories: [],
      source: "rules",
    });
  }
  return out;
}
