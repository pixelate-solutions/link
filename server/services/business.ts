import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { processUser } from "../pipeline/process";
import { reclassify } from "../pipeline/reclassify";
import { audit } from "./audit";

export const STRUCTURES = ["sole_prop", "llc", "s_corp", "partnership", "other"] as const;
export type Structure = (typeof STRUCTURES)[number];

export async function listBusinesses(userId: string) {
  const db = await getDb();
  return db.select().from(schema.businesses).where(eq(schema.businesses.userId, userId)).orderBy(schema.businesses.createdAt);
}

export async function createBusiness(userId: string, input: { name: string; structure?: Structure }) {
  const db = await getDb();
  const [row] = await db
    .insert(schema.businesses)
    .values({ userId, name: input.name.trim().slice(0, 60), structure: input.structure ?? "llc" })
    .returning();
  await audit(userId, "user", "business.create", row!.id);
  return row!;
}

export async function updateBusiness(
  userId: string,
  id: string,
  patch: { name?: string; structure?: Structure; ownershipPct?: number; countTowardGoals?: boolean; taxSetAsidePct?: number },
) {
  const db = await getDb();
  const clean = {
    ...(patch.name != null ? { name: patch.name.trim().slice(0, 60) } : {}),
    ...(patch.structure ? { structure: patch.structure } : {}),
    ...(patch.ownershipPct != null ? { ownershipPct: Math.max(1, Math.min(100, Math.round(patch.ownershipPct))) } : {}),
    ...(patch.countTowardGoals != null ? { countTowardGoals: patch.countTowardGoals } : {}),
    ...(patch.taxSetAsidePct != null ? { taxSetAsidePct: Math.max(0, Math.min(60, Math.round(patch.taxSetAsidePct))) } : {}),
  };
  const res = await db
    .update(schema.businesses)
    .set(clean)
    .where(and(eq(schema.businesses.id, id), eq(schema.businesses.userId, userId)))
    .returning({ id: schema.businesses.id });
  if (!res.length) throw new Error("Business not found");
  await audit(userId, "user", "business.update", id, clean);
  await processUser(userId);
}

/**
 * Re-label an account's history after its owner (personal vs a business) changes:
 * unpair every transfer touching it, reclassify both legs, then let the pipeline
 * re-pair them as draws, contributions or plain transfers.
 */
async function relabelAccounts(userId: string, accountIds: string[]) {
  if (!accountIds.length) return;
  const db = await getDb();
  const t = schema.transactions;
  const own = await db.select({ id: t.id, pair: t.transferPairId }).from(t).where(and(eq(t.userId, userId), inArray(t.accountId, accountIds)));
  const pairIds = [...new Set(own.map((r) => r.pair).filter((p): p is string => Boolean(p)))];
  const partners = pairIds.length
    ? await db.select({ id: t.id }).from(t).where(and(eq(t.userId, userId), isNotNull(t.transferPairId), inArray(t.transferPairId, pairIds)))
    : [];
  if (pairIds.length) await db.update(t).set({ transferPairId: null }).where(and(eq(t.userId, userId), inArray(t.transferPairId, pairIds)));
  const ids = [...new Set([...own.map((r) => r.id), ...partners.map((r) => r.id)])];
  for (let i = 0; i < ids.length; i += 5000) await reclassify(db, userId, { ids: ids.slice(i, i + 5000) });
}

export async function setAccountBusiness(userId: string, accountId: string, businessId: string | null) {
  const db = await getDb();
  const [acct] = await db.select().from(schema.accounts).where(and(eq(schema.accounts.id, accountId), eq(schema.accounts.userId, userId)));
  if (!acct) throw new Error("Account not found");
  if (businessId) {
    const [b] = await db.select({ id: schema.businesses.id }).from(schema.businesses).where(and(eq(schema.businesses.id, businessId), eq(schema.businesses.userId, userId)));
    if (!b) throw new Error("Business not found");
  }
  if ((acct.businessId ?? null) === businessId) return;
  await db.update(schema.accounts).set({ businessId, updatedAt: new Date() }).where(and(eq(schema.accounts.id, accountId), eq(schema.accounts.userId, userId)));
  await relabelAccounts(userId, [accountId]);
  await audit(userId, "user", "account.set_business", accountId, { businessId });
  await processUser(userId);
}

export async function deleteBusiness(userId: string, id: string) {
  const db = await getDb();
  const accts = await db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.businessId, id)));
  const res = await db.delete(schema.businesses).where(and(eq(schema.businesses.id, id), eq(schema.businesses.userId, userId))).returning({ id: schema.businesses.id });
  if (!res.length) throw new Error("Business not found");
  // Its accounts become personal again (FK sets business_id to null).
  await relabelAccounts(userId, accts.map((a) => a.id));
  await audit(userId, "user", "business.delete", id);
  await processUser(userId);
}
