import { and, eq, inArray, notInArray } from "drizzle-orm";
import { computeAll, type Picture, type PlanInputs } from "@/lib/finance/plan";
import { generateRecommendations, RESURFACED, type RecommendationDraft, SKIPPED, shouldResurface } from "@/lib/finance/recommend";
import { type Db, getDb, schema } from "../db/client";
import { loadUserData, type UserData } from "./data";

export const PICTURE_VERSION = 5;

export interface PlanContext {
  data: UserData;
  picture: Picture;
  inputs: PlanInputs;
}

/** Compute the picture from live data. Pure read; nothing is written. */
export async function computeContext(userId: string, now = new Date(), db?: Db): Promise<PlanContext> {
  const d = db ?? (await getDb());
  const data = await loadUserData(d, userId, now);
  const { picture, inputs } = computeAll({
    asOf: data.asOf,
    currency: data.user.currency,
    accounts: data.ledgerAccounts,
    txns: data.txns,
    reviewCount: data.reviewCount,
    otherCurrencyTxns: data.otherCurrencyTxns,
    goals: data.goals,
    facts: data.facts,
    prefs: data.prefs,
    budget: data.budget,
    ignoredRecurring: data.ignoredRecurring,
    businesses: data.businesses,
    now,
  });
  return { data, picture, inputs };
}

/** Recompute, store the snapshot, refresh recommendations and goal progress. */
export async function refreshPicture(userId: string, now = new Date()): Promise<Picture> {
  const db = await getDb();
  const ctx = await computeContext(userId, now, db);
  const { picture } = ctx;
  await db
    .insert(schema.snapshots)
    .values({ userId, computedAt: now, asOf: picture.asOf, version: PICTURE_VERSION, data: picture })
    .onConflictDoUpdate({ target: schema.snapshots.userId, set: { computedAt: now, asOf: picture.asOf, version: PICTURE_VERSION, data: picture } });

  const drafts = generateRecommendations({ picture, inputs: ctx.inputs, goals: ctx.data.goals, prefs: ctx.data.prefs });
  await syncRecommendations(db, userId, drafts, now);

  for (const g of picture.goals) {
    const metrics = {
      status: g.status,
      headline: g.headline,
      progress: g.progress,
      fiYearsP50: g.fi?.monteCarlo.yearsP50 ?? null,
      saved: g.savedAmount ?? null,
    };
    await db
      .insert(schema.goalProgress)
      .values({ goalId: g.id, userId, date: picture.asOf, metrics })
      .onConflictDoUpdate({ target: [schema.goalProgress.goalId, schema.goalProgress.date], set: { metrics } });
  }
  return picture;
}

/**
 * Recommendation lifecycle:
 *  - new fingerprint → inserted as active
 *  - existing active → refreshed in place (no duplicates)
 *  - dismissed → stays dismissed unless the impact changed materially after 30 days
 *  - skipped → comes back after a week if it still ranks as important (marked "resurfaced")
 *  - applied/done → never re-created for the same fingerprint
 *  - active but no longer generated → expired
 */
export async function syncRecommendations(db: Db, userId: string, drafts: RecommendationDraft[], now = new Date()) {
  const existing = await db.select().from(schema.recommendations).where(eq(schema.recommendations.userId, userId));
  const byFp = new Map(existing.map((r) => [r.fingerprint, r]));
  for (const d of drafts) {
    const row = byFp.get(d.fingerprint);
    const values = {
      kind: d.kind,
      title: d.title,
      detail: d.detail,
      action: d.action,
      impact: d.impact,
      evidence: d.evidence,
      assumptions: d.assumptions,
      tradeoffs: d.tradeoffs ?? null,
      goalIds: d.goalIds,
      confidence: d.confidence,
      score: d.score,
      evaluatedAt: now,
    };
    if (!row) {
      await db.insert(schema.recommendations).values({ userId, fingerprint: d.fingerprint, basisMinor: d.basis, ...values });
      continue;
    }
    if (row.status === "active" || row.status === "expired") {
      await db
        .update(schema.recommendations)
        .set({ ...values, status: "active", basisMinor: d.basis })
        .where(and(eq(schema.recommendations.id, row.id), eq(schema.recommendations.userId, userId)));
    } else if (row.status === "dismissed" && row.resolvedAt && shouldResurface(row.basisMinor, d.basis, row.resolvedAt, now, row.feedback === SKIPPED ? { score: d.score } : undefined)) {
      await db
        .update(schema.recommendations)
        .set({ ...values, status: "active", basisMinor: d.basis, resolvedAt: null, feedback: RESURFACED })
        .where(and(eq(schema.recommendations.id, row.id), eq(schema.recommendations.userId, userId)));
    }
  }
  const live = drafts.map((d) => d.fingerprint);
  await db
    .update(schema.recommendations)
    .set({ status: "expired", evaluatedAt: now })
    .where(
      and(
        eq(schema.recommendations.userId, userId),
        eq(schema.recommendations.status, "active"),
        live.length ? notInArray(schema.recommendations.fingerprint, live) : undefined,
      ),
    );
}

export async function getPicture(userId: string): Promise<Picture> {
  const db = await getDb();
  const [row] = await db.select().from(schema.snapshots).where(eq(schema.snapshots.userId, userId));
  if (row && row.version === PICTURE_VERSION) return row.data as Picture;
  return refreshPicture(userId);
}

export async function activeRecommendations(userId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.recommendations)
    .where(and(eq(schema.recommendations.userId, userId), inArray(schema.recommendations.status, ["active"])));
  return rows.sort((a, b) => b.score - a.score);
}
