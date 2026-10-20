import type { AccountType } from "@/lib/finance/classify";
import { toMinor } from "@/lib/finance/money";

/** The subset of Plaid's shapes Link relies on (kept narrow so fixtures stay honest). */
export interface PlaidAccountLike {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  type: string;
  subtype?: string | null;
  balances: { current?: number | null; available?: number | null; limit?: number | null; iso_currency_code?: string | null; last_updated_datetime?: string | null };
}

export interface PlaidTxnLike {
  transaction_id: string;
  account_id: string;
  amount: number; // Plaid: positive = money out
  iso_currency_code?: string | null;
  unofficial_currency_code?: string | null;
  date: string;
  authorized_date?: string | null;
  name?: string | null;
  original_description?: string | null;
  merchant_name?: string | null;
  pending: boolean;
  pending_transaction_id?: string | null;
  payment_channel?: string | null;
  personal_finance_category?: { primary: string; detailed: string; confidence_level?: string | null } | null;
  logo_url?: string | null;
  website?: string | null;
  counterparties?: { name?: string | null; type?: string | null; logo_url?: string | null; website?: string | null }[] | null;
}

/** Only https image URLs from the provider are kept; anything else is dropped. */
function httpsUrl(v: string | null | undefined): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
}

/** Plaid's objects carry many more fields than these; every one is kept as sent in `accounts.plaid.liability`. */
type Raw = Record<string, unknown>;
export interface PlaidLiabilitiesLike {
  credit?: (Raw & { account_id: string | null; aprs?: { apr_percentage: number; apr_type: string }[]; last_statement_balance?: number | null; minimum_payment_amount?: number | null; next_payment_due_date?: string | null })[] | null;
  mortgage?: (Raw & { account_id: string; interest_rate?: { percentage?: number | null; type?: string | null } | null; next_monthly_payment?: number | null; next_payment_due_date?: string | null })[] | null;
  student?: (Raw & { account_id: string | null; interest_rate_percentage?: number | null; minimum_payment_amount?: number | null; next_payment_due_date?: string | null })[] | null;
  loan?: (Raw & { account_id: string; interest_rate?: { percentage?: number | null } | null; next_payment_amount?: number | null; next_payment_due_date?: string | null })[] | null;
  line_of_credit?: (Raw & {
    account_id: string;
    aprs?: { apr_percentage: number; apr_type: string }[] | null;
    interest_rate?: { percentage?: number | null } | null;
    minimum_payment_amount?: number | null;
    next_payment_amount?: number | null;
    last_statement_balance?: number | null;
    next_payment_due_date?: string | null;
  })[] | null;
}

export type LiabilityType = "credit" | "mortgage" | "student" | "loan" | "line_of_credit";

/**
 * A Plaid payload made safe to keep: Postgres jsonb rejects NUL characters (one would fail the
 * whole sync), and full account numbers are cut to their last four digits, the way banks show them.
 */
export function cleanRaw<T>(v: T): T {
  const walk = (x: unknown): unknown => {
    if (typeof x === "string") return x.replaceAll("\u0000", "");
    if (Array.isArray(x)) return x.map(walk);
    if (!x || typeof x !== "object") return x;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(x)) {
      if (k === "account_numbers") continue;
      if (k === "account_number") out.account_number_last4 = typeof val === "string" && val ? val.slice(-4) : null;
      else out[k] = walk(val);
    }
    return out;
  };
  return walk(v) as T;
}

const ACCOUNT_TYPES = new Set<AccountType>(["depository", "credit", "loan", "investment", "other"]);

export function mapAccount(a: PlaidAccountLike, asOf: Date) {
  const type = (ACCOUNT_TYPES.has(a.type as AccountType) ? a.type : a.type === "brokerage" ? "investment" : "other") as AccountType;
  const m = (v: number | null | undefined) => (v == null ? null : toMinor(v));
  return {
    providerAccountId: a.account_id,
    name: a.name,
    officialName: a.official_name ?? null,
    mask: a.mask ?? null,
    type,
    subtype: a.subtype ?? null,
    currency: a.balances.iso_currency_code ?? "USD",
    currentMinor: m(a.balances.current),
    availableMinor: m(a.balances.available),
    limitMinor: m(a.balances.limit),
    balanceAsOf: a.balances.last_updated_datetime ? new Date(a.balances.last_updated_datetime) : asOf,
  };
}

/**
 * The columns Link plans with (rate, payment, statement balance, due date), plus the whole
 * liability as Plaid sent it, tagged with its `type`, for `accounts.plaid.liability`.
 */
export function mapLiabilities(l: PlaidLiabilitiesLike | null | undefined) {
  const out = new Map<string, { aprBps: number | null; minPaymentMinor: number | null; statementBalanceMinor: number | null; nextPaymentDue: string | null; raw: Raw & { type: LiabilityType } }>();
  const bps = (pct: number | null | undefined) => (pct == null ? null : Math.round(pct * 100));
  const minor = (v: number | null | undefined) => (v == null ? null : toMinor(v));
  const purchaseApr = (aprs: { apr_percentage: number; apr_type: string }[] | null | undefined) => (aprs?.find((a) => a.apr_type === "purchase_apr") ?? aprs?.[0])?.apr_percentage;
  const add = (type: LiabilityType, raw: Raw & { account_id: string | null }, cols: { aprBps: number | null; minPaymentMinor: number | null; statementBalanceMinor: number | null; nextPaymentDue: string | null }) => {
    // An account listed under two types keeps the first (credit before line of credit).
    if (raw.account_id && !out.has(raw.account_id)) out.set(raw.account_id, { ...cols, raw: cleanRaw({ type, ...raw }) });
  };
  for (const c of l?.credit ?? []) {
    add("credit", c, { aprBps: bps(purchaseApr(c.aprs)), minPaymentMinor: minor(c.minimum_payment_amount), statementBalanceMinor: minor(c.last_statement_balance), nextPaymentDue: c.next_payment_due_date ?? null });
  }
  for (const m of l?.mortgage ?? []) {
    add("mortgage", m, { aprBps: bps(m.interest_rate?.percentage), minPaymentMinor: minor(m.next_monthly_payment), statementBalanceMinor: null, nextPaymentDue: m.next_payment_due_date ?? null });
  }
  for (const s of l?.student ?? []) {
    add("student", s, { aprBps: bps(s.interest_rate_percentage), minPaymentMinor: minor(s.minimum_payment_amount), statementBalanceMinor: null, nextPaymentDue: s.next_payment_due_date ?? null });
  }
  for (const n of l?.loan ?? []) {
    add("loan", n, { aprBps: bps(n.interest_rate?.percentage), minPaymentMinor: minor(n.next_payment_amount), statementBalanceMinor: null, nextPaymentDue: n.next_payment_due_date ?? null });
  }
  for (const c of l?.line_of_credit ?? []) {
    add("line_of_credit", c, {
      aprBps: bps(purchaseApr(c.aprs) ?? c.interest_rate?.percentage),
      minPaymentMinor: minor(c.minimum_payment_amount ?? c.next_payment_amount),
      statementBalanceMinor: minor(c.last_statement_balance),
      nextPaymentDue: c.next_payment_due_date ?? null,
    });
  }
  return out;
}

/** Source facts for a transaction. Plaid's sign is flipped here, and only here. */
export function mapTransactionFacts(t: PlaidTxnLike) {
  return {
    providerId: t.transaction_id,
    pendingProviderId: t.pending_transaction_id ?? null,
    amountMinor: -toMinor(t.amount),
    currency: t.iso_currency_code ?? t.unofficial_currency_code ?? "USD",
    date: t.date,
    authorizedDate: t.authorized_date ?? null,
    pending: t.pending,
    name: (t.name ?? t.original_description ?? t.merchant_name ?? "Unknown").slice(0, 300),
    providerMerchant: t.merchant_name ?? null,
    providerPrimary: t.personal_finance_category?.primary ?? null,
    providerDetailed: t.personal_finance_category?.detailed ?? null,
    providerConfidence: t.personal_finance_category?.confidence_level ?? null,
    paymentChannel: t.payment_channel ?? null,
    // The merchant's logo, else the first counterparty that has one (e.g. a payment processor's merchant).
    logoUrl: httpsUrl(t.logo_url) ?? httpsUrl(t.counterparties?.find((c) => c.logo_url)?.logo_url),
    website: (t.website ?? t.counterparties?.find((c) => c.website)?.website ?? null)?.slice(0, 200) ?? null,
  };
}
