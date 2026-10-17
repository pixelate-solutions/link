import { type CategoryId, category as categoryDef, type TransactionKind, isCategoryId } from "./categories";

const categoryLabelLower = (c: CategoryId) => categoryDef(c).label.toLowerCase();
import type { Minor } from "./money";
import { normalizeMerchant } from "./merchants";

/**
 * Layered, deterministic transaction classification. Order of authority:
 *   1. explicit user rules
 *   2. learned corrections for this merchant
 *   3. structural detection (transfers, card payments, payroll, refunds)
 *   4. provider categories (Plaid personal_finance_category)
 *   5. merchant knowledge
 *   6. the user's own history with this merchant
 *   7. uncertain → flagged (the server may ask the model, in batches)
 */

export type AccountType = "depository" | "credit" | "loan" | "investment" | "other";

export type ClassificationSource =
  | "user"
  | "rule"
  | "learned"
  | "structural"
  | "transfer_match"
  | "provider"
  | "merchant"
  | "history"
  | "ai"
  | "default";

export interface ClassifyInput {
  amount: Minor; // + inflow, - outflow
  name: string;
  merchantName?: string | null;
  accountId: string;
  accountType: AccountType;
  accountSubtype?: string | null;
  providerPrimary?: string | null;
  providerDetailed?: string | null;
  providerConfidence?: string | null;
  /** The account belongs to one of the user's businesses. */
  business?: boolean;
}

export interface RuleCondition {
  merchant?: string; // case-insensitive contains, matched against normalized merchant and raw name
  nameContains?: string;
  providerDetailed?: string; // prefix match, e.g. "TRANSPORTATION_GAS"
  accountId?: string;
  minAbsAmount?: Minor;
  maxAbsAmount?: Minor;
  direction?: "in" | "out";
}

export interface Rule {
  id: string;
  priority: number; // lower runs first
  when: RuleCondition;
  unless?: RuleCondition;
  then: { category?: CategoryId; kind?: TransactionKind };
}

export interface LearnedMapping {
  category: CategoryId;
  kind: TransactionKind;
}

export interface ClassifyContext {
  rules?: Rule[];
  /** `${merchantKey}|in|out` (or bare merchantKey for older corrections) → mapping, from the user's corrections. */
  learned?: Map<string, LearnedMapping>;
  /** merchantKey → most common prior classification for this user. */
  history?: Map<string, LearnedMapping & { count: number }>;
}

export interface Classification {
  kind: TransactionKind;
  category: CategoryId;
  merchant: string;
  merchantKey: string;
  source: ClassificationSource;
  confidence: number; // 0..1
  needsReview: boolean;
  reason: string;
}

/** Above this size an uncertain transaction is worth asking about. */
export const REVIEW_THRESHOLD_MINOR = 50_00;
/** Low-confidence but plausible categories only interrupt for larger amounts. */
export const REVIEW_THRESHOLD_LOW_CONFIDENCE_MINOR = 250_00;

const PFC_DETAILED: Record<string, CategoryId> = {
  INCOME_WAGES: "paycheck",
  INCOME_SALARY: "paycheck",
  INCOME_GIG_ECONOMY: "paycheck",
  INCOME_CONTRACTOR: "paycheck",
  INCOME_OTHER: "other_income",
  INCOME_RENTAL: "other_income",
  INCOME_DIVIDENDS: "interest",
  INCOME_INTEREST_EARNED: "interest",
  INCOME_RETIREMENT_PENSION: "other_income",
  INCOME_TAX_REFUND: "other_income",
  INCOME_UNEMPLOYMENT: "other_income",
  INCOME_OTHER_INCOME: "other_income",
  FOOD_AND_DRINK_GROCERIES: "groceries",
  FOOD_AND_DRINK_RESTAURANT: "dining",
  FOOD_AND_DRINK_FAST_FOOD: "dining",
  FOOD_AND_DRINK_COFFEE: "dining",
  FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: "dining",
  FOOD_AND_DRINK_VENDING_MACHINES: "dining",
  FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK: "dining",
  TRANSPORTATION_GAS: "fuel",
  TRAVEL_FLIGHTS: "travel",
  TRAVEL_LODGING: "travel",
  TRAVEL_RENTAL_CARS: "travel",
  TRAVEL_OTHER_TRAVEL: "travel",
  RENT_AND_UTILITIES_RENT: "housing",
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: "housing",
  LOAN_PAYMENTS_CAR_PAYMENT: "debt_interest",
  LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT: "debt_interest",
  LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT: "debt_interest",
  LOAN_PAYMENTS_OTHER_PAYMENT: "debt_interest",
  GENERAL_SERVICES_INSURANCE: "insurance",
  GENERAL_SERVICES_CHILDCARE: "childcare",
  GENERAL_SERVICES_EDUCATION: "childcare",
  GENERAL_SERVICES_AUTOMOTIVE: "transport",
  GENERAL_MERCHANDISE_PET_SUPPLIES: "pets",
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: "gifts",
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: "gifts",
  GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: "taxes",
  ENTERTAINMENT_TV_AND_MOVIES: "subscriptions",
  ENTERTAINMENT_MUSIC_AND_AUDIO: "subscriptions",
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: "personal_care",
  MEDICAL_PHARMACIES_AND_SUPPLEMENTS: "healthcare",
};

const PFC_PRIMARY: Record<string, CategoryId> = {
  INCOME: "other_income",
  FOOD_AND_DRINK: "dining",
  GENERAL_MERCHANDISE: "shopping",
  HOME_IMPROVEMENT: "home",
  MEDICAL: "healthcare",
  PERSONAL_CARE: "personal_care",
  GENERAL_SERVICES: "services",
  GOVERNMENT_AND_NON_PROFIT: "taxes",
  TRANSPORTATION: "transport",
  TRAVEL: "travel",
  RENT_AND_UTILITIES: "utilities",
  ENTERTAINMENT: "entertainment",
  BANK_FEES: "fees",
  LOAN_PAYMENTS: "debt_interest",
};

const PFC_CONFIDENCE: Record<string, number> = { VERY_HIGH: 0.95, HIGH: 0.9, MEDIUM: 0.72, LOW: 0.5, UNKNOWN: 0.5 };

const RE = {
  cardPayment:
    /\b(payment\s*(-\s*)?(thank(\s*you)?|received|recv)|automatic\s*payment|autopay|auto\s*pay|card\s*(services\s*)?payment|e-?payment|crd\s*epay|cardmember\s*serv|credit\s*card\s*pmt|applecard\s*gsbank)/i,
  issuerDebit: /\b(chase\s*credit\s*crd|amex\s*epayment|american\s*express|citi\s*(card|autopay)|capital\s*one\s*(crcardpmt|mobile\s*pmt)|discover\s*(e-?payment|card))\b/i,
  transfer: /\b(transfer|xfer|trnsfr|online\s*banking\s*transfer|to\s*(savings|checking)|from\s*(savings|checking)|internal\s*transfer)\b/i,
  investment: /\b(vanguard|fidelity|schwab|betterment|wealthfront|robinhood|e\*?trade|brokerage|401k|ira\s*contrib)\b/i,
  payroll: /\b(payroll|direct\s*dep(osit)?|dir\s*dep|salary|adp|gusto|paychex|workday|intuit\s*payroll|pay\s*roll)\b/i,
  interest: /\b(interest\s*(paid|payment|earned)|int(e?re?st)?\s*(earned|pymnt|pmt)|intrst\s*pymnt|dividend)\b/i,
  mortgage: /\b(mortgage|mtg\s*pmt|home\s*loan|rocket\s*mortgage|mr\.?\s*cooper|loan\s*servic)/i,
  loan: /\b(auto\s*loan|student\s*loan|navient|nelnet|sallie\s*mae|great\s*lakes|car\s*payment)\b/i,
  refund: /\b(refund|return|reversal|credit\s*adj|merchandise\s*credit)\b/i,
  fee: /\b(overdraft|nsf|service\s*charge|monthly\s*(maintenance\s*)?fee|atm\s*fee|late\s*fee|foreign\s*transaction\s*fee|annual\s*fee)\b/i,
  rent: /\b(rent|apartments?|property\s*management|zillow\s*rent)\b/i,
  utility: /\b(electric|power|energy|water|gas\s*co|utilit|pg&e|con\s*ed|duke\s*energy|internet|wireless)\b/i,
};

function matches(cond: RuleCondition, input: ClassifyInput, merchant: string): boolean {
  const hay = `${merchant} ${input.merchantName ?? ""} ${input.name}`.toLowerCase();
  if (cond.merchant && !hay.includes(cond.merchant.toLowerCase())) return false;
  if (cond.nameContains && !input.name.toLowerCase().includes(cond.nameContains.toLowerCase())) return false;
  if (cond.providerDetailed && !(input.providerDetailed ?? "").startsWith(cond.providerDetailed)) return false;
  if (cond.accountId && cond.accountId !== input.accountId) return false;
  const a = Math.abs(input.amount);
  if (cond.minAbsAmount != null && a < cond.minAbsAmount) return false;
  if (cond.maxAbsAmount != null && a > cond.maxAbsAmount) return false;
  if (cond.direction === "in" && input.amount <= 0) return false;
  if (cond.direction === "out" && input.amount >= 0) return false;
  return true;
}

function ruleApplies(rule: Rule, input: ClassifyInput, merchant: string): boolean {
  return matches(rule.when, input, merchant) && !(rule.unless && matches(rule.unless, input, merchant));
}

function defaultKind(input: ClassifyInput, category: CategoryId): TransactionKind {
  return kindForCategory(category, input.amount);
}

/**
 * The kind a category implies for money in or out. Used wherever a category is
 * chosen by a rule, a person or the model, so "Revenue" counts as income and
 * "Owner draw" as a draw rather than a refund or an expense.
 */
export function kindForCategory(category: CategoryId, amount: Minor, current?: TransactionKind): TransactionKind {
  const inflow = amount > 0;
  switch (category) {
    case "transfer":
      return "transfer";
    case "card_payment":
      return "card_payment";
    case "investment":
      return "investment_transfer";
    case "paycheck":
    case "other_income":
    case "interest":
    case "revenue":
      return inflow ? "income" : "expense";
    case "owner_draw":
      // Out of the business it's a draw; into a personal account it's the owner's income.
      return inflow ? "income" : "owner_draw";
    case "owner_contribution":
      return inflow ? "owner_contribution" : "investment_transfer";
    case "fees":
      return inflow ? "refund" : "fee";
    default:
      if (current === "loan_payment" && !inflow) return "loan_payment";
      return inflow ? "refund" : "expense";
  }
}

interface Structural {
  kind: TransactionKind;
  category: CategoryId;
  confidence: number;
  reason: string;
}

/** Detect what the money movement *is*, independent of merchant category. */
export function detectStructure(input: ClassifyInput): Structural | null {
  const text = `${input.name} ${input.merchantName ?? ""}`;
  const p = input.providerPrimary ?? "";
  const d = input.providerDetailed ?? "";
  const inflow = input.amount > 0;

  // On a card account a payment description means a card payment, whatever sign the bank reports.
  if (d === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" || (input.accountType === "credit" && RE.cardPayment.test(text))) {
    return { kind: "card_payment", category: "card_payment", confidence: 0.95, reason: "Credit card payment" };
  }
  if (input.accountType === "depository" && !inflow && (RE.cardPayment.test(text) || RE.issuerDebit.test(text))) {
    return { kind: "card_payment", category: "card_payment", confidence: 0.9, reason: "Payment to a credit card" };
  }
  if (input.accountType === "loan") {
    // Activity inside a loan account is never spending: payments arrive from elsewhere,
    // and interest added to the balance is paid through the loan payment (counted there).
    return inflow
      ? { kind: "transfer", category: "transfer", confidence: 0.9, reason: "Payment received on a loan" }
      : { kind: "transfer", category: "debt_interest", confidence: 0.9, reason: "Interest added to the loan balance; it's paid through your loan payments" };
  }
  if (p === "LOAN_DISBURSEMENTS" || d === "TRANSFER_IN_CASH_ADVANCES_AND_LOANS") {
    return { kind: "transfer", category: "transfer", confidence: 0.9, reason: "Borrowed money (a loan or cash advance), not income" };
  }
  if (input.accountType === "investment") {
    return {
      kind: "investment_transfer",
      category: "investment",
      confidence: 0.85,
      reason: "Activity inside an investment account",
    };
  }
  if (d.startsWith("LOAN_PAYMENTS_MORTGAGE") || (!inflow && RE.mortgage.test(text))) {
    return { kind: "loan_payment", category: "housing", confidence: 0.92, reason: "Mortgage payment" };
  }
  if (p === "LOAN_PAYMENTS" || (!inflow && RE.loan.test(text))) {
    return { kind: "loan_payment", category: "debt_interest", confidence: 0.88, reason: "Loan payment" };
  }
  if (inflow && input.accountType === "depository" && RE.interest.test(text)) {
    return { kind: "income", category: "interest", confidence: 0.9, reason: "Interest or dividends" };
  }
  if (p === "TRANSFER_IN" || p === "TRANSFER_OUT") {
    const invest = d.includes("INVESTMENT") || d.includes("RETIREMENT") || RE.investment.test(text);
    return invest
      ? { kind: "investment_transfer", category: "investment", confidence: 0.85, reason: "Transfer to investments" }
      : { kind: "transfer", category: "transfer", confidence: 0.85, reason: "Transfer between accounts" };
  }
  if (!inflow && RE.investment.test(text) && RE.transfer.test(text)) {
    return { kind: "investment_transfer", category: "investment", confidence: 0.8, reason: "Transfer to investments" };
  }
  if (RE.transfer.test(text) && !RE.payroll.test(text)) {
    return { kind: "transfer", category: "transfer", confidence: 0.75, reason: "Looks like a transfer" };
  }
  if (inflow && (d === "INCOME_WAGES" || d === "INCOME_SALARY" || RE.payroll.test(text))) {
    return { kind: "income", category: "paycheck", confidence: 0.93, reason: "Payroll deposit" };
  }
  if (inflow && (d === "INCOME_INTEREST_EARNED" || d === "INCOME_DIVIDENDS" || RE.interest.test(text))) {
    return { kind: "income", category: "interest", confidence: 0.92, reason: "Interest or dividends" };
  }
  if (p === "BANK_FEES" || (!inflow && RE.fee.test(text))) {
    return { kind: "fee", category: "fees", confidence: 0.9, reason: "Bank fee" };
  }
  return null;
}

const BIZ = {
  payroll: /\b(payroll|adp|gusto|paychex|rippling|justworks|trinet)\b/i,
  contractors: /\b(upwork|fiverr|toptal|deel|contractor|freelanc|1099)\b/i,
  advertising: /\b(google\s*\*?\s*ads|adwords|facebk|facebook\s*ads|meta\s*(ads|platforms)|linkedin\s*ads|tiktok\s*ads|bing\s*ads|ads\s*manager)/i,
  payout: /\b(stripe|square\s*inc|sq\s*\*?\s*(payout|deposit)|paypal\s*(transfer|payout)|shopify\s*(payments|payout)|etsy\s*(deposit|payout)|amazon\s*payments|venmo\s*business|toast\s*deposit)/i,
  software: /\b(adobe|figma|github|notion|slack|zoom|aws|amazon\s*web\s*services|google\s*(workspace|cloud|gsuite)|microsoft|msft|dropbox|atlassian|vercel|heroku|openai|anthropic|quickbooks|intuit|xero|shopify|squarespace|wix|godaddy|namecheap|hubspot|mailchimp|canva|calendly|docusign|1password|cloudflare)\b/i,
  professional: /\b(cpa|accounting|accountant|bookkeep|legal|law\s*(firm|office)|attorney|llc\s*filing|registered\s*agent|legalzoom)\b/i,
};

/**
 * Re-label a personal-style classification for a business account. Rules and
 * corrections are left alone; money movements keep their kind.
 */
function forBusiness(c: Classification, input: ClassifyInput): Classification {
  if (c.source === "rule" || c.source === "learned" || c.source === "user") return c;
  const text = `${input.name} ${input.merchantName ?? ""}`;
  const out = input.amount < 0;
  const set = (category: CategoryId, reason: string): Classification => ({ ...c, category, reason, needsReview: false });
  if (c.kind === "income") return c.category === "interest" ? c : set("revenue", "Money coming into the business");
  // Payment-processor payouts often say "transfer", but for a business they're sales.
  if (c.kind === "transfer" && !out && BIZ.payout.test(text)) return { ...set("revenue", "Payout from a payment processor (sales)"), kind: "income" };
  if (c.kind !== "expense" && c.kind !== "refund") return c;
  if (out && BIZ.payroll.test(text)) return set("payroll", "Payroll for the business");
  if (BIZ.contractors.test(text)) return set("contractors", "Payment to a contractor or freelance platform");
  if (BIZ.advertising.test(text)) return set("advertising", "Advertising");
  if (BIZ.software.test(text) || c.category === "subscriptions") return set("software", "Software or a business subscription");
  if (BIZ.professional.test(text) || input.providerDetailed?.startsWith("GENERAL_SERVICES_ACCOUNTING")) return set("professional", "Accounting, legal or other professional services");
  if (c.category === "shopping" || c.category === "home" || c.category === "general") return set("supplies", "Business supplies or inventory");
  return c;
}

export function classify(input: ClassifyInput, ctx: ClassifyContext = {}): Classification {
  const c = classifyBase(input, ctx);
  return input.business ? forBusiness(c, input) : c;
}

function classifyBase(input: ClassifyInput, ctx: ClassifyContext): Classification {
  const m = normalizeMerchant(input.name, input.merchantName);
  const base = { merchant: m.name, merchantKey: m.key };
  const done = (c: Omit<Classification, "merchant" | "merchantKey" | "needsReview">, needsReview = false): Classification => ({
    ...base,
    ...c,
    needsReview,
  });

  // 1. Explicit user rules.
  const rules = [...(ctx.rules ?? [])].sort((a, b) => a.priority - b.priority);
  for (const rule of rules) {
    if (!ruleApplies(rule, input, m.name)) continue;
    const category = rule.then.category ?? defaultCategoryFor(input, m.category);
    return done({
      kind: rule.then.kind ?? defaultKind(input, category),
      category,
      source: "rule",
      confidence: 0.99,
      reason: "Matched one of your rules",
    });
  }

  // 2. Learned from the user's corrections.
  const learned = ctx.learned?.get(`${m.key}|${input.amount > 0 ? "in" : "out"}`) ?? ctx.learned?.get(m.key);
  if (learned) {
    const kind = learned.kind === "expense" && input.amount > 0 ? "refund" : learned.kind;
    return done({ kind, category: learned.category, source: "learned", confidence: 0.96, reason: `You categorized ${m.name} before` });
  }

  // 3. Structural movements.
  const s = detectStructure(input);
  if (s) return done({ ...s, source: "structural" });

  // 4. Provider category.
  const providerCat =
    (input.providerDetailed && PFC_DETAILED[input.providerDetailed]) ||
    (input.providerPrimary && PFC_PRIMARY[input.providerPrimary]) ||
    null;
  const providerConf = PFC_CONFIDENCE[input.providerConfidence ?? "UNKNOWN"] ?? 0.5;

  // 5. Merchant knowledge outranks a low-confidence provider guess.
  if (m.category && (!providerCat || providerConf < 0.9 || providerCat === m.category)) {
    return done({
      kind: defaultKind(input, m.category),
      category: m.category,
      source: "merchant",
      confidence: 0.92,
      reason: `${m.name} is a known ${categoryLabelLower(m.category)} merchant`,
    });
  }
  if (providerCat && providerConf >= 0.7) {
    return done({
      kind: defaultKind(input, providerCat),
      category: providerCat,
      source: "provider",
      confidence: providerConf,
      reason: "Category supplied by your bank data",
    });
  }

  // 6. User's own history with this merchant.
  const hist = ctx.history?.get(m.key);
  if (hist && hist.count >= 2) {
    return done({
      kind: hist.kind === "expense" && input.amount > 0 ? "refund" : hist.kind,
      category: hist.category,
      source: "history",
      confidence: Math.min(0.9, 0.7 + hist.count * 0.03),
      reason: `Matches ${hist.count} earlier ${m.name} transactions`,
    });
  }

  // Name heuristics for common essentials.
  if (!input.amount || input.amount < 0) {
    if (RE.rent.test(input.name)) {
      return done({ kind: "expense", category: "housing", source: "structural", confidence: 0.7, reason: "Looks like rent" });
    }
    if (RE.utility.test(input.name)) {
      return done({ kind: "expense", category: "utilities", source: "structural", confidence: 0.7, reason: "Looks like a utility" });
    }
  }
  if (input.amount > 0 && RE.refund.test(input.name)) {
    return done(
      { kind: "refund", category: providerCat ?? "general", source: "structural", confidence: 0.6, reason: "Looks like a refund" },
      Math.abs(input.amount) >= REVIEW_THRESHOLD_MINOR,
    );
  }

  if (providerCat) {
    // A plausible bank category is only worth a question when the amount is large.
    return done(
      { kind: defaultKind(input, providerCat), category: providerCat, source: "provider", confidence: providerConf, reason: "Low-confidence bank category" },
      Math.abs(input.amount) >= REVIEW_THRESHOLD_LOW_CONFIDENCE_MINOR,
    );
  }

  // 7. Unknown.
  const inflow = input.amount > 0;
  return done(
    {
      kind: inflow ? "income" : "expense",
      category: inflow ? "other_income" : "general",
      source: "default",
      confidence: 0.3,
      reason: "Not enough information to be sure",
    },
    Math.abs(input.amount) >= REVIEW_THRESHOLD_MINOR,
  );
}

function defaultCategoryFor(input: ClassifyInput, merchantCategory?: CategoryId): CategoryId {
  if (merchantCategory) return merchantCategory;
  const d = input.providerDetailed ? PFC_DETAILED[input.providerDetailed] : undefined;
  if (d) return d;
  return input.amount > 0 ? "other_income" : "general";
}

export function toCategoryId(value: string | null | undefined): CategoryId | null {
  return value && isCategoryId(value) ? value : null;
}
