import type { TransactionKind } from "./categories";
import type { AccountType } from "./classify";
import { daysBetween, type ISODate } from "./dates";
import type { Minor } from "./money";

export interface TransferCandidate {
  id: string;
  accountId: string;
  accountType: AccountType;
  accountSubtype?: string | null;
  amount: Minor;
  date: ISODate;
  kind: TransactionKind;
  /** Already paired, or explicitly classified by the user: never re-pair. */
  locked?: boolean;
  transferPairId?: string | null;
}

export interface TransferMatch {
  outflowId: string;
  inflowId: string;
  /** Kind for the outflow leg; the inflow leg is always a plain transfer. */
  outflowKind: TransactionKind;
  outflowCategory: "transfer" | "card_payment" | "investment" | "housing" | "debt_interest";
  inflowKind: TransactionKind;
  dayGap: number;
}

const MOVEMENT_KINDS = new Set<TransactionKind>(["transfer", "card_payment", "investment_transfer", "loan_payment"]);
const MAX_GAP_DAYS = 5;

/**
 * Pair equal-and-opposite movements between two of the user's own accounts so
 * that neither leg is counted as income or spending. A pair must be within a
 * few days, on different accounts, and at least one leg must already look like
 * a movement (to avoid pairing a $40 refund with an unrelated $40 purchase).
 */
export function matchTransfers(txns: TransferCandidate[]): TransferMatch[] {
  const open = txns.filter((t) => !t.locked && !t.transferPairId && t.amount !== 0);
  const inflows = open.filter((t) => t.amount > 0);
  const outflows = open.filter((t) => t.amount < 0).sort((a, b) => a.date.localeCompare(b.date));
  const used = new Set<string>();
  const matches: TransferMatch[] = [];

  for (const out of outflows) {
    let best: TransferCandidate | null = null;
    let bestGap = Infinity;
    for (const inn of inflows) {
      if (used.has(inn.id) || inn.accountId === out.accountId || inn.amount !== -out.amount) continue;
      const gap = Math.abs(daysBetween(out.date, inn.date));
      if (gap > MAX_GAP_DAYS) continue;
      const plausible =
        MOVEMENT_KINDS.has(out.kind) ||
        MOVEMENT_KINDS.has(inn.kind) ||
        inn.accountType === "credit" ||
        inn.accountType === "loan" ||
        inn.accountType === "investment";
      if (!plausible) continue;
      if (gap < bestGap) {
        best = inn;
        bestGap = gap;
      }
    }
    if (!best) continue;
    used.add(best.id);
    matches.push({ outflowId: out.id, inflowId: best.id, dayGap: bestGap, ...legKinds(out, best) });
  }
  return matches;
}

function legKinds(out: TransferCandidate, inn: TransferCandidate): Pick<TransferMatch, "outflowKind" | "outflowCategory" | "inflowKind"> {
  if (inn.accountType === "credit") {
    return { outflowKind: "card_payment", outflowCategory: "card_payment", inflowKind: "card_payment" };
  }
  if (inn.accountType === "loan") {
    // Paying a loan from cash is a real obligation (spending); the loan-side
    // credit is just the other leg and must not count again.
    const mortgage = (inn.accountSubtype ?? "").includes("mortgage") || (inn.accountSubtype ?? "") === "home equity";
    return { outflowKind: "loan_payment", outflowCategory: mortgage ? "housing" : "debt_interest", inflowKind: "transfer" };
  }
  if (inn.accountType === "investment" || out.accountType === "investment") {
    return { outflowKind: "investment_transfer", outflowCategory: "investment", inflowKind: "investment_transfer" };
  }
  return { outflowKind: "transfer", outflowCategory: "transfer", inflowKind: "transfer" };
}
