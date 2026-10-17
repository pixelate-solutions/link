import type { CategoryId, TransactionKind } from "./categories";
import type { AccountType } from "./classify";
import type { ISODate } from "./dates";
import type { Minor } from "./money";

/** The minimal, provider-independent shape every finance engine works with. */
export interface LedgerTxn {
  id: string;
  accountId: string;
  date: ISODate;
  amount: Minor; // + inflow, - outflow
  kind: TransactionKind;
  category: CategoryId;
  merchant: string;
  merchantKey: string;
  pending: boolean;
  splits?: { amount: Minor; category: CategoryId; kind: TransactionKind }[];
  /** For paired transfers: what kind of account the other leg is in. */
  transferTo?: "spendable" | "savings" | "investment" | "liability" | null;
}

export interface LedgerAccount {
  id: string;
  name: string;
  type: AccountType;
  subtype?: string | null;
  currency: string;
  /** Provider convention: for credit/loan, positive = amount owed. */
  current: Minor | null;
  available: Minor | null;
  limit?: Minor | null;
  balanceAsOf: string | null; // ISO instant
  aprBps?: number | null;
  minPayment?: Minor | null;
  statementBalance?: Minor | null;
  nextPaymentDue?: ISODate | null;
  hidden?: boolean;
  manual?: boolean;
}

/** Expand a transaction into its (amount, category, kind) lines, honoring splits. */
export function lines(t: LedgerTxn): { amount: Minor; category: CategoryId; kind: TransactionKind }[] {
  return t.splits && t.splits.length ? t.splits : [{ amount: t.amount, category: t.category, kind: t.kind }];
}

export const RETIREMENT_SUBTYPES = new Set([
  "401k", "401a", "403b", "457b", "ira", "roth", "roth 401k", "sep ira", "simple ira", "keogh", "pension",
  "retirement", "rrsp", "tfsa", "lira", "thrift savings plan", "sarsep", "profit sharing plan", "stock plan",
]);

export function isRetirement(a: Pick<LedgerAccount, "type" | "subtype">): boolean {
  return a.type === "investment" && RETIREMENT_SUBTYPES.has((a.subtype ?? "").toLowerCase());
}

/** Accounts whose balance can pay this week's bills. */
export function isSpendable(a: Pick<LedgerAccount, "type" | "subtype">): boolean {
  const s = (a.subtype ?? "").toLowerCase();
  return a.type === "depository" && s !== "savings" && s !== "cd" && s !== "money market" && s !== "hsa";
}

export function isCashReserve(a: Pick<LedgerAccount, "type" | "subtype">): boolean {
  const s = (a.subtype ?? "").toLowerCase();
  return a.type === "depository" && (s === "savings" || s === "money market" || s === "cd");
}

/** Signed value of an account toward net worth (liabilities negative). */
export function netWorthValue(a: LedgerAccount): Minor {
  const bal = a.current ?? 0;
  // Positive = owed. A negative card balance is a credit the user is owed.
  return a.type === "credit" || a.type === "loan" ? -bal : bal;
}

export function accountRole(a: Pick<LedgerAccount, "type" | "subtype">): "spendable" | "savings" | "investment" | "liability" {
  if (a.type === "credit" || a.type === "loan") return "liability";
  if (a.type === "investment") return "investment";
  return isSpendable(a) ? "spendable" : "savings";
}
