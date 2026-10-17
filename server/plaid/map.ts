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

export interface PlaidLiabilitiesLike {
  credit?: { account_id: string | null; aprs?: { apr_percentage: number; apr_type: string }[]; last_statement_balance?: number | null; minimum_payment_amount?: number | null; next_payment_due_date?: string | null }[] | null;
  mortgage?: { account_id: string; interest_rate?: { percentage?: number | null } | null; next_monthly_payment?: number | null; next_payment_due_date?: string | null }[] | null;
  student?: { account_id: string | null; interest_rate_percentage?: number | null; minimum_payment_amount?: number | null; next_payment_due_date?: string | null }[] | null;
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

export function mapLiabilities(l: PlaidLiabilitiesLike | null | undefined) {
  const out = new Map<string, { aprBps: number | null; minPaymentMinor: number | null; statementBalanceMinor: number | null; nextPaymentDue: string | null }>();
  const bps = (pct: number | null | undefined) => (pct == null ? null : Math.round(pct * 100));
  for (const c of l?.credit ?? []) {
    if (!c.account_id) continue;
    const apr = c.aprs?.find((a) => a.apr_type === "purchase_apr") ?? c.aprs?.[0];
    out.set(c.account_id, {
      aprBps: bps(apr?.apr_percentage),
      minPaymentMinor: c.minimum_payment_amount == null ? null : toMinor(c.minimum_payment_amount),
      statementBalanceMinor: c.last_statement_balance == null ? null : toMinor(c.last_statement_balance),
      nextPaymentDue: c.next_payment_due_date ?? null,
    });
  }
  for (const m of l?.mortgage ?? []) {
    out.set(m.account_id, {
      aprBps: bps(m.interest_rate?.percentage),
      minPaymentMinor: m.next_monthly_payment == null ? null : toMinor(m.next_monthly_payment),
      statementBalanceMinor: null,
      nextPaymentDue: m.next_payment_due_date ?? null,
    });
  }
  for (const s of l?.student ?? []) {
    if (!s.account_id) continue;
    out.set(s.account_id, {
      aprBps: bps(s.interest_rate_percentage),
      minPaymentMinor: s.minimum_payment_amount == null ? null : toMinor(s.minimum_payment_amount),
      statementBalanceMinor: null,
      nextPaymentDue: s.next_payment_due_date ?? null,
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
