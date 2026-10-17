/**
 * A small single-owner LLC that sits alongside the synthetic household: client
 * revenue, software, contractors, ads, bookkeeping, a business card, and a
 * monthly owner draw into the household's personal checking ("chk1").
 */
import { addMonths, type ISODate } from "@/lib/finance/dates";
import { rng } from "@/lib/finance/fi";
import type { PlaidAccountLike } from "../plaid/map";
import { AS_OF, type LabeledTxn, type Truth } from "./household";

const START: ISODate = "2026-03-01";

export const BUSINESS_ACCOUNTS: PlaidAccountLike[] = [
  { account_id: "bizchk", name: "Rivera Studio LLC Checking", mask: "9999", type: "depository", subtype: "checking", balances: { current: 18400, available: 18400, iso_currency_code: "USD" } },
  { account_id: "bizcc", name: "Rivera Studio Card", mask: "8888", type: "credit", subtype: "credit card", balances: { current: 1240.5, available: 8759.5, limit: 10000, iso_currency_code: "USD" } },
];

export const OWNER_DRAW = 3000;

export function buildBusiness(): LabeledTxn[] {
  const rand = rng(777);
  const between = (lo: number, hi: number) => Math.round((lo + rand() * (hi - lo)) * 100) / 100;
  const txns: LabeledTxn[] = [];
  let n = 0;
  const cardSpend = new Map<string, number>();
  const add = (account: string, date: ISODate, amount: number, name: string, truth: Truth) => {
    if (date > AS_OF || date < START) return;
    txns.push({ transaction_id: `biz_${String(++n).padStart(4, "0")}`, account_id: account, amount, iso_currency_code: "USD", date, name, pending: false, truth });
    if (account === "bizcc" && amount > 0) cardSpend.set(date.slice(0, 7), Math.round(((cardSpend.get(date.slice(0, 7)) ?? 0) + amount) * 100) / 100);
  };

  for (let month = START; month <= AS_OF; month = addMonths(month, 1, 1)) {
    const ym = month.slice(0, 7);
    const day = (d: number) => `${ym}-${String(d).padStart(2, "0")}`;
    // Revenue: a retainer client plus Stripe payouts.
    add("bizchk", day(3), -3500, "ACH CREDIT ACME CLIENT INC RETAINER", { kind: "income", category: "revenue" });
    add("bizchk", day(12), -between(1800, 3400), "STRIPE TRANSFER ST-8Q2", { kind: "income", category: "revenue" });
    add("bizchk", day(26), -between(900, 2600), "STRIPE TRANSFER ST-4K9", { kind: "income", category: "revenue" });
    // Costs.
    add("bizcc", day(4), 59.99, "ADOBE *CREATIVE CLD", { kind: "expense", category: "software" });
    add("bizcc", day(6), 45, "FIGMA MONTHLY", { kind: "expense", category: "software" });
    add("bizcc", day(7), 14.4, "GOOGLE *WORKSPACE RIVERA", { kind: "expense", category: "software" });
    add("bizcc", day(15), between(250, 380), "GOOGLE *ADS8812", { kind: "expense", category: "advertising" });
    add("bizchk", day(18), between(600, 950), "UPWORK -ESCROW 81123", { kind: "expense", category: "contractors" });
    add("bizchk", day(20), 249, "BENCH ACCOUNTING BOOKKEEP", { kind: "expense", category: "professional" });
    if (rand() > 0.4) add("bizcc", day(22), between(40, 160), "AMZN Mktp US*7Y2KQ", { kind: "expense", category: "supplies" });
    // Owner draw into personal checking, both legs.
    add("bizchk", day(25), OWNER_DRAW, "ONLINE TRANSFER TO CHK ...1111", { kind: "owner_draw", category: "owner_draw" });
    txns.push({ transaction_id: `biz_draw_${ym}`, account_id: "chk1", amount: -OWNER_DRAW, iso_currency_code: "USD", date: day(25), name: "ONLINE TRANSFER FROM CHK ...9999", pending: false, truth: { kind: "income", category: "owner_draw" } });
  }
  // Pay the business card from business checking (both legs).
  for (const [m, amt] of cardSpend) {
    const d = addMonths(`${m}-28`, 1);
    add("bizchk", d, amt, "PAYMENT TO RIVERA STUDIO CARD", { kind: "card_payment", category: "card_payment" });
    add("bizcc", d, -amt, "PAYMENT RECEIVED - THANK YOU", { kind: "card_payment", category: "card_payment" });
  }
  return txns.filter((t) => t.date <= AS_OF).sort((a, b) => a.date.localeCompare(b.date));
}

/** Attach the LLC to a seeded household: sync its accounts, create the business, assign them. */
export async function attachDemoBusiness(connection: { id: string; userId: string }, now?: Date) {
  const [{ getDb, schema }, { applySyncBatch }, { createBusiness, setAccountBusiness }, { ACCOUNTS }, { and, eq }] = await Promise.all([
    import("../db/client"),
    import("../plaid/sync"),
    import("../services/business"),
    import("./household"),
    import("drizzle-orm"),
  ]);
  const db = await getDb();
  await applySyncBatch(db, connection, { accounts: [...ACCOUNTS, ...BUSINESS_ACCOUNTS], added: buildBusiness().map(({ truth: _t, ...t }) => t), modified: [], removed: [], nextCursor: "biz" }, now);
  const b = await createBusiness(connection.userId, { name: "Rivera Studio LLC", structure: "llc" });
  for (const providerId of ["bizchk", "bizcc"]) {
    const [a] = await db.select({ id: schema.accounts.id }).from(schema.accounts).where(and(eq(schema.accounts.userId, connection.userId), eq(schema.accounts.providerAccountId, providerId)));
    await setAccountBusiness(connection.userId, a!.id, b.id);
  }
  return b.id;
}
