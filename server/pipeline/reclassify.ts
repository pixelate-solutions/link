import { and, eq, inArray, isNull } from "drizzle-orm";
import { type AccountType, classify } from "@/lib/finance/classify";
import { type Db, schema } from "../db/client";
import { loadClassifyContext } from "./context";

/** Re-run classification for unlocked transactions (all, by merchant, or by id). */
export async function reclassify(db: Db, userId: string, scope: { merchantKey?: string; ids?: string[]; sources?: string[] } = {}) {
  const ctx = await loadClassifyContext(db, userId);
  const accounts = await db
    .select({ id: schema.accounts.id, type: schema.accounts.type, subtype: schema.accounts.subtype })
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, userId));
  const acct = new Map(accounts.map((a) => [a.id, a]));
  const t = schema.transactions;
  const conds = [eq(t.userId, userId), eq(t.userLocked, false), isNull(t.removedAt)];
  if (scope.merchantKey) conds.push(eq(t.merchantKey, scope.merchantKey));
  if (scope.ids?.length) conds.push(inArray(t.id, scope.ids));
  if (scope.sources?.length) conds.push(inArray(t.classSource, scope.sources));
  const rows = await db.select().from(t).where(and(...conds));
  let changed = 0;
  for (const r of rows) {
    const a = acct.get(r.accountId);
    if (!a) continue;
    const c = classify(
      {
        amount: r.amountMinor,
        name: r.name,
        merchantName: r.providerMerchant,
        accountId: r.accountId,
        accountType: a.type as AccountType,
        accountSubtype: a.subtype,
        providerPrimary: r.providerPrimary,
        providerDetailed: r.providerDetailed,
        providerConfidence: r.providerConfidence,
      },
      ctx,
    );
    // Transfer pairs stay paired unless a rule or correction says otherwise.
    if (r.transferPairId && c.source !== "rule" && c.source !== "learned") continue;
    if (c.category === r.category && c.kind === r.kind && c.source === r.classSource) continue;
    // Model and carried-over categories are only replaced by something stronger.
    if ((r.classSource === "ai" || r.classSource === "legacy") && !["rule", "learned", "structural"].includes(c.source)) continue;
    if (r.transferPairId) {
      // Unpair both legs together; the pipeline re-pairs what still matches.
      await db.update(t).set({ transferPairId: null }).where(and(eq(t.userId, userId), eq(t.transferPairId, r.transferPairId)));
    }
    await db
      .update(t)
      .set({
        category: c.category,
        kind: c.kind,
        merchant: c.merchant,
        merchantKey: c.merchantKey,
        classSource: c.source,
        confidence: c.confidence,
        reason: c.reason,
        needsReview: c.needsReview,
        transferPairId: null,
        updatedAt: new Date(),
      })
      .where(and(eq(t.id, r.id), eq(t.userId, userId)));
    changed++;
  }
  return changed;
}
