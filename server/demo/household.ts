/**
 * Synthetic household for the acceptance test (spec §35), in raw Plaid shapes
 * (Plaid sign convention: positive amount = money out). Every transaction
 * carries a ground-truth label so tests can measure classification accuracy
 * and reconcile spending totals exactly.
 *
 * Two checking accounts, one savings, two credit cards, a mortgage, an IRA;
 * biweekly + semimonthly payroll; mortgage and utilities; groceries,
 * restaurants (rising lately), online shopping; internal transfers; card
 * repayments; a refund; irregular expenses; subscriptions (one new); and a
 * few genuinely ambiguous merchants.
 */
import { addDays, addMonths, type ISODate } from "@/lib/finance/dates";
import { rng } from "@/lib/finance/fi";
import type { CategoryId, TransactionKind } from "@/lib/finance/categories";
import type { PlaidAccountLike, PlaidLiabilitiesLike, PlaidTxnLike } from "../plaid/map";

export const AS_OF: ISODate = "2026-10-15";
const START: ISODate = "2026-03-01";

export interface Truth {
  kind: TransactionKind;
  category: CategoryId;
  /** Ambiguous by design: no single right answer without asking. */
  ambiguous?: boolean;
}

export type LabeledTxn = PlaidTxnLike & { truth: Truth };

export const ACCOUNTS: PlaidAccountLike[] = [
  { account_id: "chk1", name: "Everyday Checking", mask: "1111", type: "depository", subtype: "checking", balances: { current: 6240.18, available: 6155.88, iso_currency_code: "USD" } },
  { account_id: "chk2", name: "Joint Checking", mask: "2222", type: "depository", subtype: "checking", balances: { current: 2180.55, available: 2180.55, iso_currency_code: "USD" } },
  { account_id: "sav", name: "High-Yield Savings", mask: "3333", type: "depository", subtype: "savings", balances: { current: 9500, available: 9500, iso_currency_code: "USD" } },
  { account_id: "cc1", name: "Sapphire Card", mask: "4444", type: "credit", subtype: "credit card", balances: { current: 1860.42, available: 13139.58, limit: 15000, iso_currency_code: "USD" } },
  { account_id: "cc2", name: "Cash Rewards Card", mask: "5555", type: "credit", subtype: "credit card", balances: { current: 640.1, available: 7359.9, limit: 8000, iso_currency_code: "USD" } },
  { account_id: "mort", name: "Home Mortgage", mask: "6666", type: "loan", subtype: "mortgage", balances: { current: 285400, available: null, iso_currency_code: "USD" } },
  { account_id: "ira", name: "Rollover IRA", mask: "7777", type: "investment", subtype: "ira", balances: { current: 68250, available: null, iso_currency_code: "USD" } },
];

export const LIABILITIES: PlaidLiabilitiesLike = {
  credit: [
    { account_id: "cc1", aprs: [{ apr_percentage: 22.49, apr_type: "purchase_apr" }], last_statement_balance: 1712.3, minimum_payment_amount: 35, next_payment_due_date: "2026-10-25" },
  ],
  mortgage: [
    {
      account_id: "mort",
      interest_rate: { percentage: 6.25, type: "fixed" },
      next_monthly_payment: 2050,
      next_payment_due_date: "2026-11-01",
      escrow_balance: 3141.5,
      has_pmi: false,
      has_prepayment_penalty: false,
      last_payment_amount: 2050,
      last_payment_date: "2026-10-01",
      loan_term: "30 year",
      loan_type_description: "conventional",
      maturity_date: "2052-04-01",
      origination_date: "2022-03-15",
      origination_principal_amount: 312000,
      past_due_amount: null,
      property_address: { street: "1 Example St", city: "Springfield", region: "IL", postal_code: "62701", country: "US" },
      ytd_interest_paid: 14210.12,
      ytd_principal_paid: 4120.4,
    },
  ],
};

type Pfc = [string, string, string?];

export function buildHousehold(): LabeledTxn[] {
  const rand = rng(20261015);
  const between = (lo: number, hi: number) => Math.round((lo + rand() * (hi - lo)) * 100) / 100;
  const txns: LabeledTxn[] = [];
  let n = 0;
  const add = (account: string, date: ISODate, amount: number, name: string, truth: Truth, pfc?: Pfc, opts: Partial<PlaidTxnLike> = {}) => {
    if (date > AS_OF || date < START) return;
    txns.push({
      transaction_id: `tx_${String(++n).padStart(4, "0")}`,
      account_id: account,
      amount,
      iso_currency_code: "USD",
      date,
      authorized_date: date,
      name,
      merchant_name: opts.merchant_name ?? null,
      pending: opts.pending ?? false,
      pending_transaction_id: null,
      payment_channel: "online",
      personal_finance_category: pfc ? { primary: pfc[0], detailed: pfc[1], confidence_level: pfc[2] ?? "VERY_HIGH" } : null,
      truth,
      ...opts,
    });
  };

  // Biweekly payroll into checking 1.
  for (let d = "2026-03-06"; d <= AS_OF; d = addDays(d, 14)) {
    add("chk1", d, -3150, "ACME CORP PAYROLL PPD ID: 9921", { kind: "income", category: "paycheck" }, ["INCOME", "INCOME_SALARY"]);
  }

  const cc1Spend = new Map<string, number>();
  const cc2Spend = new Map<string, number>();
  const card = (acct: "cc1" | "cc2", date: ISODate, amount: number) => {
    const m = date.slice(0, 7);
    const map = acct === "cc1" ? cc1Spend : cc2Spend;
    map.set(m, Math.round(((map.get(m) ?? 0) + amount) * 100) / 100);
  };
  const charge = (acct: "cc1" | "cc2", date: ISODate, amount: number, name: string, truth: Truth, pfc?: Pfc, opts?: Partial<PlaidTxnLike>) => {
    add(acct, date, amount, name, truth, pfc, opts);
    if (date <= AS_OF && date >= START) card(acct, date, amount);
  };

  for (let month = START; month <= AS_OF; month = addMonths(month, 1, 1)) {
    const ym = month.slice(0, 7);
    const day = (d: number) => `${ym}-${String(d).padStart(2, "0")}`;
    const late = ym >= "2026-08"; // dining has crept up lately

    // Partner's semimonthly pay into joint checking.
    add("chk2", day(1), -1850, "GUSTO PAY 88231 BRIGHTLINE", { kind: "income", category: "paycheck" }, ["INCOME", "INCOME_SALARY"]);
    add("chk2", day(15), -1850, "GUSTO PAY 88231 BRIGHTLINE", { kind: "income", category: "paycheck" }, ["INCOME", "INCOME_SALARY"]);

    // Mortgage, both legs.
    add("chk1", day(1), 2050, "ROCKET MORTGAGE PMT", { kind: "loan_payment", category: "housing" }, ["LOAN_PAYMENTS", "LOAN_PAYMENTS_MORTGAGE_PAYMENT"]);
    add("mort", day(1), -2050, "PAYMENT RECEIVED", { kind: "transfer", category: "transfer" });

    // Utilities and insurance.
    add("chk1", day(12), between(110, 185), "PG&E WEB ONLINE", { kind: "expense", category: "utilities" }, ["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY"]);
    charge("cc1", day(22), 89.99, "COMCAST XFINITY", { kind: "expense", category: "utilities" }, ["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_INTERNET_AND_CABLE"]);
    charge("cc2", day(18), 135, "VERIZON WIRELESS", { kind: "expense", category: "utilities" }, ["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_TELEPHONE"]);
    add("chk1", day(8), 142, "GEICO *AUTO", { kind: "expense", category: "insurance" }, ["GENERAL_SERVICES", "GENERAL_SERVICES_INSURANCE"]);

    // Subscriptions; Peloton is new as of August.
    charge("cc1", day(5), 22.99, "NETFLIX.COM", { kind: "expense", category: "subscriptions" }, ["ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES"]);
    charge("cc2", day(9), 11.99, "SPOTIFY USA", { kind: "expense", category: "subscriptions" }, ["ENTERTAINMENT", "ENTERTAINMENT_MUSIC_AND_AUDIO"]);
    if (ym >= "2026-08") charge("cc1", day(3), 44, "PELOTON* MEMBERSHIP", { kind: "expense", category: "personal_care" }, ["PERSONAL_CARE", "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS"]);

    // Ambiguous: a monthly Zelle to a person.
    add("chk2", day(2), 160, "ZELLE TO MARIA GARCIA", { kind: "expense", category: "services", ambiguous: true });

    // Savings and investing transfers, both legs.
    add("chk2", day(16), 400, "ONLINE TRANSFER TO SAVINGS XXXXXX3333", { kind: "transfer", category: "transfer" }, ["TRANSFER_OUT", "TRANSFER_OUT_SAVINGS"]);
    add("sav", day(16), -400, "ONLINE TRANSFER FROM CHK XXXXXX2222", { kind: "transfer", category: "transfer" }, ["TRANSFER_IN", "TRANSFER_IN_SAVINGS"]);
    add("chk1", day(20), 500, "VANGUARD BUY INVESTMENT", { kind: "investment_transfer", category: "investment" }, ["TRANSFER_OUT", "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS"]);
    add("ira", day(20), -500, "CONTRIBUTION", { kind: "investment_transfer", category: "investment" });

    // Savings interest at month end.
    const eom = addDays(addMonths(month, 1, 1), -1);
    add("sav", eom, -between(28, 34), "INTEREST PAYMENT", { kind: "income", category: "interest" }, ["INCOME", "INCOME_INTEREST_EARNED"]);

    // Groceries every week; Costco every other week.
    for (let w = 0; w < 5; w++) {
      const d = addDays(day(1), 2 + w * 7);
      if (d.slice(0, 7) !== ym) continue;
      if (w % 2 === 0) charge("cc1", d, between(180, 260), "COSTCO WHSE #0482", { kind: "expense", category: "groceries" }, w === 0 ? undefined : ["FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"]);
      else charge("cc2", d, between(70, 120), "TRADER JOE S #552", { kind: "expense", category: "groceries" }, ["FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"]);
      charge("cc1", addDays(d, 3), between(40, 95), "WHOLEFDS MKT #10234", { kind: "expense", category: "groceries" }, ["FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"]);
    }
    // Fuel.
    charge("cc1", day(6), between(45, 62), "COSTCO GAS #0482", { kind: "expense", category: "fuel" }, ["TRANSPORTATION", "TRANSPORTATION_GAS"]);
    charge("cc1", day(21), between(45, 62), "COSTCO GAS #0482", { kind: "expense", category: "fuel" });
    charge("cc2", day(13), between(40, 58), "SHELL OIL 57444", { kind: "expense", category: "fuel" }, ["TRANSPORTATION", "TRANSPORTATION_GAS"]);

    // Dining: ~$360/month before August, ~$600 after.
    const meals = late ? 13 : 8;
    for (let i = 0; i < meals; i++) {
      const d = day(1 + Math.floor((i * 27) / meals));
      const pick = i % 4;
      if (pick === 0) charge("cc2", d, between(6, 9), "SQ *BLUE BOTTLE COFFEE", { kind: "expense", category: "dining" }, i % 8 === 0 ? undefined : ["FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE"]);
      else if (pick === 1) charge("cc1", d, between(60, 110), "TST* NOPA SF", { kind: "expense", category: "dining" }, ["FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT"]);
      else if (pick === 2) charge("cc2", d, between(14, 22), "CHIPOTLE 2213", { kind: "expense", category: "dining" }, ["FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD"]);
      else charge("cc1", d, between(35, 55), "DOORDASH*THAI PALACE", { kind: "expense", category: "dining" }, ["FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT"]);
    }

    // Online shopping.
    for (let i = 0; i < 3; i++) {
      charge("cc2", day(4 + i * 9), between(15, 120), `AMZN Mktp US*${["2K4L71XX2", "8Q1M03ZZ1", "5T7P22YY9"][i]}`, { kind: "expense", category: "shopping" }, ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES"]);
    }
    // A small unknown market charge.
    charge("cc2", day(24), between(18, 34), "SQ *MKT 4421", { kind: "expense", category: "groceries", ambiguous: true });
  }

  // Internal transfers between checking accounts.
  for (const d of ["2026-04-03", "2026-06-03", "2026-09-03"]) {
    add("chk1", d, 600, "ONLINE TRANSFER TO CHK ...2222", { kind: "transfer", category: "transfer" }, ["TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER"]);
    add("chk2", d, -600, "ONLINE TRANSFER FROM CHK ...1111", { kind: "transfer", category: "transfer" }, ["TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER"]);
  }

  // Refund, irregular expenses, ambiguous one-offs.
  charge("cc2", "2026-07-14", -64.2, "AMZN MKTP US REFUND", { kind: "refund", category: "shopping" });
  charge("cc1", "2026-06-20", 1240, "DELTA AIR LINES 0062", { kind: "expense", category: "travel" }, ["TRAVEL", "TRAVEL_FLIGHTS"]);
  charge("cc1", "2026-06-24", 690, "MARRIOTT SF", { kind: "expense", category: "travel" }, ["TRAVEL", "TRAVEL_LODGING"]);
  add("chk1", "2026-09-12", 860, "SUNRISE AUTO REPAIR", { kind: "expense", category: "transport" }, ["GENERAL_SERVICES", "GENERAL_SERVICES_AUTOMOTIVE"]);
  add("chk1", "2026-05-19", 350, "PAYPAL *JSMITHDESIGN", { kind: "expense", category: "services", ambiguous: true });
  add("chk1", "2026-08-05", 1200, "CHECK #1042", { kind: "expense", category: "general", ambiguous: true });

  // Card repayments, paid in full from checking a month later (both legs).
  for (const [m, amt] of cc1Spend) {
    const d = addMonths(`${m}-25`, 1);
    add("chk1", d, amt, "CHASE CREDIT CRD AUTOPAY", { kind: "card_payment", category: "card_payment" }, ["LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"]);
    add("cc1", d, -amt, "AUTOMATIC PAYMENT - THANK YOU", { kind: "card_payment", category: "card_payment" }, ["LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"]);
  }
  for (const [m, amt] of cc2Spend) {
    const d = addMonths(`${m}-10`, 1);
    add("chk2", d, amt, "CITI AUTOPAY PAYMENT", { kind: "card_payment", category: "card_payment" });
    add("cc2", d, -amt, "PAYMENT RECEIVED - THANK YOU", { kind: "card_payment", category: "card_payment" });
  }

  // Pending activity in the last two days.
  add("chk1", "2026-10-14", 84.3, "TST* NOPA SF", { kind: "expense", category: "dining" }, ["FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT"], { pending: true, transaction_id: "tx_pending_nopa" });
  add("cc1", "2026-10-14", 96.12, "WHOLEFDS MKT #10234", { kind: "expense", category: "groceries" }, ["FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"], { pending: true, transaction_id: "tx_pending_wf" });

  return txns.sort((a, b) => a.date.localeCompare(b.date) || a.transaction_id.localeCompare(b.transaction_id));
}

/** Ground-truth monthly spending (positive dollars) for a calendar month, from labels. */
export function truthSpending(txns: LabeledTxn[], month: string): number {
  const spending = new Set<TransactionKind>(["expense", "refund", "fee", "loan_payment"]);
  let total = 0;
  for (const t of txns) {
    if (t.pending || !t.date.startsWith(month) || !spending.has(t.truth.kind)) continue;
    total += t.amount; // Plaid sign: positive = out
  }
  return Math.round(total * 100);
}
