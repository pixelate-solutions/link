import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { daysBetween } from "@/lib/finance/dates";
import type { AccountType } from "@/lib/finance/classify";
import { detectRecurring } from "@/lib/finance/recurring";
import { matchTransfers } from "@/lib/finance/transfers";
import { type Db, getDb, schema } from "../db/client";
import { enqueue } from "../jobs";
import { log } from "../log";
import { aiConfigured } from "../ai/provider";
import { loadUserData } from "../services/data";
import { reclassify } from "./reclassify";
import { refreshPicture } from "../services/picture";

const UNPAIRED_REVIEW_MINOR = 250_00;

/** Pair transfers between the user's own accounts and update both legs. */
export async function pairTransfers(db: Db, userId: string, asOf: string) {
  const accounts = await db
    .select({ id: schema.accounts.id, type: schema.accounts.type, subtype: schema.accounts.subtype })
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, userId));
  const acct = new Map(accounts.map((a) => [a.id, a]));
  const rows = await db
    .select({
      id: schema.transactions.id,
      accountId: schema.transactions.accountId,
      amount: schema.transactions.amountMinor,
      date: schema.transactions.date,
      kind: schema.transactions.kind,
      userLocked: schema.transactions.userLocked,
      transferPairId: schema.transactions.transferPairId,
      needsReview: schema.transactions.needsReview,
      classSource: schema.transactions.classSource,
    })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.userId, userId), isNull(schema.transactions.removedAt), eq(schema.transactions.pending, false)));

  const matches = matchTransfers(
    rows.map((r) => ({
      id: r.id,
      accountId: r.accountId,
      accountType: (acct.get(r.accountId)?.type ?? "other") as AccountType,
      accountSubtype: acct.get(r.accountId)?.subtype,
      amount: r.amount,
      date: r.date,
      kind: r.kind as never,
      locked: r.userLocked,
      transferPairId: r.transferPairId,
    })),
  );
  for (const m of matches) {
    const pair = randomUUID();
    await db.transaction(async (tx) => {
      await tx
        .update(schema.transactions)
        .set({ kind: m.outflowKind, category: m.outflowCategory, transferPairId: pair, classSource: "transfer_match", confidence: 0.97, needsReview: false, reason: "Matched with a transfer between your accounts", updatedAt: new Date() })
        .where(and(eq(schema.transactions.id, m.outflowId), eq(schema.transactions.userId, userId)));
      await tx
        .update(schema.transactions)
        .set({
          kind: m.inflowKind,
          category: m.inflowKind === "card_payment" ? "card_payment" : m.inflowKind === "investment_transfer" ? "investment" : "transfer",
          transferPairId: pair,
          classSource: "transfer_match",
          confidence: 0.97,
          needsReview: false,
          reason: "Matched with a transfer between your accounts",
          updatedAt: new Date(),
        })
        .where(and(eq(schema.transactions.id, m.inflowId), eq(schema.transactions.userId, userId)));
    });
  }

  // Large transfers with no matching leg may be money leaving the user's accounts: worth one look.
  const paired = new Set(matches.flatMap((m) => [m.outflowId, m.inflowId]));
  // Only bank accounts: a payment arriving on a loan or card is never spending.
  const lonely = rows.filter(
    (r) =>
      acct.get(r.accountId)?.type === "depository" &&
      !r.userLocked &&
      !r.transferPairId &&
      !paired.has(r.id) &&
      r.kind === "transfer" &&
      Math.abs(r.amount) >= UNPAIRED_REVIEW_MINOR &&
      daysBetween(r.date, asOf) > 5 &&
      !r.needsReview,
  );
  if (lonely.length) {
    await db
      .update(schema.transactions)
      .set({ needsReview: true, reason: "A transfer to or from an account Link can't see" })
      .where(and(eq(schema.transactions.userId, userId), inArray(schema.transactions.id, lonely.map((r) => r.id))));
  }
  return matches.length;
}

/** Persist detected recurring series, preserving the user's own decisions. */
export async function persistRecurring(db: Db, userId: string) {
  const data = await loadUserData(db, userId);
  const series = detectRecurring(data.txns, data.asOf);
  const keys = new Set(series.map((s) => s.key));
  for (const s of series) {
    const [row] = await db
      .insert(schema.recurring)
      .values({
        userId,
        key: s.key,
        merchant: s.merchant,
        kind: s.kind,
        category: s.category,
        cadence: s.cadence,
        amountMinor: s.amount,
        variability: s.variability,
        firstDate: s.firstDate,
        lastDate: s.lastDate,
        nextDate: s.nextDate,
        occurrences: s.occurrences,
        confidence: s.confidence,
        accountId: s.accountId,
        status: s.active ? "active" : "ended",
      })
      .onConflictDoUpdate({
        target: [schema.recurring.userId, schema.recurring.key],
        set: {
          merchant: s.merchant,
          kind: s.kind,
          category: s.category,
          cadence: s.cadence,
          amountMinor: s.amount,
          variability: s.variability,
          lastDate: s.lastDate,
          nextDate: s.nextDate,
          occurrences: s.occurrences,
          confidence: s.confidence,
          // Never resurrect a series the user said isn't recurring.
          status: sql`case when ${schema.recurring.status} = 'ignored' then 'ignored' else ${s.active ? "active" : "ended"} end`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: schema.recurring.id });
    if (row && s.transactionIds.length) {
      await db
        .update(schema.transactions)
        .set({ recurringId: row.id })
        .where(and(eq(schema.transactions.userId, userId), inArray(schema.transactions.id, s.transactionIds)));
    }
  }
  // Series no longer detected are ended, not deleted (history stays reproducible).
  const stale = await db
    .select({ id: schema.recurring.id, key: schema.recurring.key })
    .from(schema.recurring)
    .where(and(eq(schema.recurring.userId, userId), eq(schema.recurring.status, "active")));
  const gone = stale.filter((r) => !keys.has(r.key)).map((r) => r.id);
  if (gone.length) {
    await db
      .update(schema.recurring)
      .set({ status: "ended", nextDate: null })
      .where(and(eq(schema.recurring.userId, userId), inArray(schema.recurring.id, gone)));
  }
  return series.length;
}

/**
 * The full post-ingestion pipeline for one user. Idempotent: running it twice
 * produces the same state.
 */
export async function processUser(userId: string, now = new Date()) {
  const db = await getDb();
  const started = Date.now();
  // Records classified before the user's history existed get a second, better-informed pass.
  await reclassify(db, userId, { sources: ["default"] });
  const data = await loadUserData(db, userId, now);
  const paired = await pairTransfers(db, userId, data.asOf);
  const recurring = await persistRecurring(db, userId);
  const picture = await refreshPicture(userId, now);
  if (aiConfigured() && picture.coverage.reviewCount > 0) {
    await enqueue({ type: "ai_classify", userId, dedupeKey: `ai_classify:${userId}` });
  }
  log.info("pipeline: processed", { paired, recurring, ms: Date.now() - started });
  return picture;
}

/** Scheduled review: refresh stale connections and recompute every active user once a day. */
export async function refreshAll() {
  const db = await getDb();
  const cutoff = new Date(Date.now() - 12 * 3_600_000);
  const conns = await db
    .select({ id: schema.connections.id, userId: schema.connections.userId })
    .from(schema.connections)
    .where(and(eq(schema.connections.provider, "plaid"), inArray(schema.connections.status, ["active", "error"]), or(isNull(schema.connections.lastSyncedAt), lt(schema.connections.lastSyncedAt, cutoff))));
  for (const c of conns) await enqueue({ type: "plaid_sync", userId: c.userId, payload: { connectionId: c.id }, dedupeKey: `sync:${c.id}` });
  const users = await db.select({ id: schema.users.id }).from(schema.users);
  for (const u of users) await enqueue({ type: "process_user", userId: u.id, dedupeKey: `process:${u.id}` });
  return { connections: conns.length, users: users.length };
}
