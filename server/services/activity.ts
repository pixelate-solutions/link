import { and, desc, eq, gte, ilike, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { type CategoryId, isCategoryId, type TransactionKind, TRANSACTION_KINDS } from "@/lib/finance/categories";
import { kindForCategory, type Rule } from "@/lib/finance/classify";
import { isPaymentRail } from "@/lib/finance/merchants";
import type { Minor } from "@/lib/finance/money";
import { type ParsedRule, parseRuleText } from "@/lib/finance/rules";
import { getDb, schema } from "../db/client";
import { reclassify } from "../pipeline/reclassify";
import { processUser } from "../pipeline/process";
import { audit } from "./audit";

export interface TxnFilters {
  query?: string;
  category?: string;
  kind?: string;
  accountId?: string;
  /** "personal", or a business id. */
  scope?: string;
  from?: string;
  to?: string;
  minAbs?: Minor;
  maxAbs?: Minor;
  review?: boolean;
  recurring?: boolean;
  limit?: number;
  before?: { date: string; id: string }; // keyset pagination
}

export async function searchTransactions(userId: string, f: TxnFilters) {
  const db = await getDb();
  const t = schema.transactions;
  const conds = [eq(t.userId, userId), isNull(t.removedAt)];
  if (f.query) {
    const q = `%${f.query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(or(ilike(t.merchant, q), ilike(t.name, q), ilike(t.note, q))!);
  }
  if (f.category && isCategoryId(f.category)) conds.push(eq(t.category, f.category));
  if (f.kind && (TRANSACTION_KINDS as readonly string[]).includes(f.kind)) conds.push(eq(t.kind, f.kind));
  if (f.accountId) conds.push(eq(t.accountId, f.accountId));
  if (f.scope === "personal") conds.push(isNull(schema.accounts.businessId));
  else if (f.scope) conds.push(eq(schema.accounts.businessId, f.scope));
  if (f.from) conds.push(gte(t.date, f.from));
  if (f.to) conds.push(lte(t.date, f.to));
  if (f.minAbs != null) conds.push(sql`abs(${t.amountMinor}) >= ${f.minAbs}`);
  if (f.maxAbs != null) conds.push(sql`abs(${t.amountMinor}) <= ${f.maxAbs}`);
  if (f.review) conds.push(eq(t.needsReview, true));
  if (f.recurring) conds.push(sql`${t.recurringId} is not null`);
  if (f.before) conds.push(or(lt(t.date, f.before.date), and(eq(t.date, f.before.date), lt(t.id, f.before.id)))!);
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const rows = await db
    .select({
      id: t.id,
      accountId: t.accountId,
      accountName: schema.accounts.name,
      institution: schema.connections.institutionName,
      accountMask: schema.accounts.mask,
      businessId: schema.accounts.businessId,
      date: t.date,
      amount: t.amountMinor,
      currency: t.currency,
      pending: t.pending,
      name: t.name,
      merchant: t.merchant,
      kind: t.kind,
      category: t.category,
      classSource: t.classSource,
      confidence: t.confidence,
      reason: t.reason,
      needsReview: t.needsReview,
      userLocked: t.userLocked,
      transferPairId: t.transferPairId,
      recurringId: t.recurringId,
      hasSplits: t.hasSplits,
      note: t.note,
      merchantKey: t.merchantKey,
      logoUrl: t.logoUrl,
    })
    .from(t)
    .innerJoin(schema.accounts, and(eq(schema.accounts.id, t.accountId), eq(schema.accounts.userId, userId)))
    .leftJoin(schema.connections, eq(schema.connections.id, schema.accounts.connectionId))
    .where(and(...conds))
    .orderBy(desc(t.date), desc(t.id))
    .limit(limit + 1);
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

export type TxnListRow = Awaited<ReturnType<typeof searchTransactions>>["rows"][number];

/** Latest known logo per merchant name (lowercased), for surfaces that only know the merchant. */
export async function merchantLogos(userId: string): Promise<Record<string, string>> {
  const db = await getDb();
  const t = schema.transactions;
  const rows = await db
    .selectDistinctOn([t.merchant], { merchant: t.merchant, logoUrl: t.logoUrl })
    .from(t)
    .where(and(eq(t.userId, userId), isNull(t.removedAt), sql`${t.logoUrl} is not null`))
    .orderBy(t.merchant, desc(t.date));
  return Object.fromEntries(rows.map((r) => [r.merchant.toLowerCase(), r.logoUrl!]));
}

export async function getTransaction(userId: string, id: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.transactions)
    .where(and(eq(schema.transactions.id, id), eq(schema.transactions.userId, userId)));
  if (!row) return null;
  const [splits, history, pair, [account]] = await Promise.all([
    db.select().from(schema.splits).where(and(eq(schema.splits.transactionId, id), eq(schema.splits.userId, userId))),
    db
      .select()
      .from(schema.corrections)
      .where(and(eq(schema.corrections.transactionId, id), eq(schema.corrections.userId, userId)))
      .orderBy(desc(schema.corrections.createdAt)),
    row.transferPairId
      ? db
          .select({ id: schema.transactions.id, accountId: schema.transactions.accountId, date: schema.transactions.date, amount: schema.transactions.amountMinor })
          .from(schema.transactions)
          .where(and(eq(schema.transactions.userId, userId), eq(schema.transactions.transferPairId, row.transferPairId)))
      : Promise.resolve([]),
    db
      .select({ name: schema.accounts.name, mask: schema.accounts.mask, institution: schema.connections.institutionName })
      .from(schema.accounts)
      .leftJoin(schema.connections, eq(schema.connections.id, schema.accounts.connectionId))
      .where(and(eq(schema.accounts.id, row.accountId), eq(schema.accounts.userId, userId))),
  ]);
  return { ...row, splits, corrections: history, pair: pair.filter((p) => p.id !== id), account: account ?? null };
}

/**
 * Correct a transaction. Stores before/after (reversible), locks the row
 * against automatic reclassification and, by default, teaches the merchant
 * mapping so future transactions follow.
 */
export async function correctTransaction(
  userId: string,
  id: string,
  change: { category: CategoryId; kind?: TransactionKind; applyToMerchant?: boolean; note?: string | null; confirmed?: boolean },
  actor: "user" | "agent" = "user",
) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.transactions)
    .where(and(eq(schema.transactions.id, id), eq(schema.transactions.userId, userId)));
  if (!row) throw new Error("Transaction not found");
  const kind = change.kind ?? inferKindForCategory(change.category, row.amountMinor, row.kind as TransactionKind);
  const applyToMerchant = change.applyToMerchant ?? true;
  await db.transaction(async (tx) => {
    await tx.insert(schema.corrections).values({
      userId,
      transactionId: id,
      merchantKey: row.merchantKey,
      before: { category: row.category, kind: row.kind, classSource: row.classSource },
      // Learning is per direction: money in from a merchant isn't the same as money out.
      after: { category: change.category, kind, applyToMerchant, direction: row.amountMinor > 0 ? "in" : "out" },
    });
    await tx
      .update(schema.transactions)
      .set({
        category: change.category,
        kind,
        classSource: "user",
        confidence: 1,
        reason: change.confirmed ? "You confirmed this" : "You set this",
        needsReview: false,
        userLocked: true,
        ...(change.note !== undefined ? { note: change.note } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.transactions.id, id), eq(schema.transactions.userId, userId)));
  });
  let updatedOthers = 0;
  if (applyToMerchant) updatedOthers = await reclassify(db, userId, { merchantKey: row.merchantKey });
  await audit(userId, actor, change.confirmed ? "transaction.confirm" : "transaction.correct", id, { category: change.category, kind, applyToMerchant });
  await processUser(userId);
  return { kind, updatedOthers };
}

/**
 * The user says Link's category is right. Recorded exactly like a correction
 * to the same category, so the merchant mapping is learned and every other
 * unlocked transaction from that merchant (same direction) follows.
 */
export async function confirmTransaction(userId: string, id: string) {
  const db = await getDb();
  const [row] = await db
    .select({ category: schema.transactions.category, kind: schema.transactions.kind })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.id, id), eq(schema.transactions.userId, userId)));
  if (!row || !isCategoryId(row.category)) throw new Error("Transaction not found");
  return correctTransaction(userId, id, { category: row.category, kind: row.kind as TransactionKind, applyToMerchant: true, confirmed: true });
}

/**
 * Answer a "needs a look" group in one go. For a real merchant, one answer is
 * learned and every transaction from it (same direction) follows. For payment
 * rails like Zelle or checks, only these exact transactions are settled: the
 * next Zelle payment may be to someone else entirely.
 */
export async function settleReview(userId: string, ids: string[], category: CategoryId | null) {
  const db = await getDb();
  const t = schema.transactions;
  const rows = await db.select().from(t).where(and(eq(t.userId, userId), inArray(t.id, ids), isNull(t.removedAt)));
  if (!rows.length) throw new Error("Transaction not found");
  if (!isPaymentRail(rows[0]!.merchantKey)) {
    const first = rows[0]!;
    return category ? correctTransaction(userId, first.id, { category, applyToMerchant: true }) : confirmTransaction(userId, first.id);
  }
  await db.transaction(async (tx) => {
    for (const row of rows) {
      const cat = category ?? (isCategoryId(row.category) ? row.category : null);
      if (!cat) continue;
      const kind = inferKindForCategory(cat, row.amountMinor, row.kind as TransactionKind);
      await tx.insert(schema.corrections).values({
        userId,
        transactionId: row.id,
        merchantKey: row.merchantKey,
        before: { category: row.category, kind: row.kind, classSource: row.classSource },
        after: { category: cat, kind, applyToMerchant: false, direction: row.amountMinor > 0 ? "in" : "out" },
      });
      await tx
        .update(t)
        .set({ category: cat, kind, classSource: "user", confidence: 1, reason: category ? "You set this" : "You confirmed this", needsReview: false, userLocked: true, updatedAt: new Date() })
        .where(and(eq(t.id, row.id), eq(t.userId, userId)));
    }
  });
  await audit(userId, "user", "transaction.settle", rows[0]!.id, { count: rows.length, category });
  await processUser(userId);
  return { updatedOthers: rows.length - 1 };
}

function inferKindForCategory(category: CategoryId, amount: Minor, current: TransactionKind): TransactionKind {
  return kindForCategory(category, amount, current);
}

/** Undo the latest correction on a transaction and let automation take over again. */
export async function revertCorrection(userId: string, id: string) {
  const db = await getDb();
  const [last] = await db
    .select()
    .from(schema.corrections)
    .where(and(eq(schema.corrections.transactionId, id), eq(schema.corrections.userId, userId), isNull(schema.corrections.revertedAt)))
    .orderBy(desc(schema.corrections.createdAt))
    .limit(1);
  if (!last) return false;
  await db
    .update(schema.corrections)
    .set({ revertedAt: new Date() })
    .where(and(eq(schema.corrections.id, last.id), eq(schema.corrections.userId, userId)));
  await db
    .update(schema.transactions)
    .set({ userLocked: false })
    .where(and(eq(schema.transactions.id, id), eq(schema.transactions.userId, userId)));
  await reclassify(db, userId, { ids: [id] });
  await audit(userId, "user", "transaction.revert", id);
  await processUser(userId);
  return true;
}

export async function splitTransaction(userId: string, id: string, parts: { amount: Minor; category: CategoryId; note?: string }[]) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.transactions)
    .where(and(eq(schema.transactions.id, id), eq(schema.transactions.userId, userId)));
  if (!row) throw new Error("Transaction not found");
  if (parts.length === 1) throw new Error("A split needs at least two parts");
  if (parts.length) {
    const total = parts.reduce((s, p) => s + p.amount, 0);
    if (total !== row.amountMinor) throw new Error(`Split parts must add up to the transaction amount (${row.amountMinor}), got ${total}`);
    if (parts.some((p) => Math.sign(p.amount) !== Math.sign(row.amountMinor) || p.amount === 0)) throw new Error("Each part must have the same sign as the transaction");
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.splits).where(and(eq(schema.splits.transactionId, id), eq(schema.splits.userId, userId)));
    if (parts.length) {
      await tx.insert(schema.splits).values(
        parts.map((p) => ({
          userId,
          transactionId: id,
          amountMinor: p.amount,
          category: p.category,
          kind: inferKindForCategory(p.category, p.amount, row.kind as TransactionKind),
          note: p.note ?? null,
        })),
      );
    }
    await tx
      .update(schema.transactions)
      .set({ hasSplits: parts.length > 0, userLocked: true, needsReview: false, updatedAt: new Date() })
      .where(and(eq(schema.transactions.id, id), eq(schema.transactions.userId, userId)));
  });
  await audit(userId, "user", "transaction.split", id, { parts: parts.length });
  await processUser(userId);
}

export async function addRules(userId: string, rules: ParsedRule[], source: "user" | "ai" = "user") {
  const db = await getDb();
  const ids: string[] = [];
  for (const r of rules) {
    const [row] = await db
      .insert(schema.rules)
      .values({ userId, description: r.description, when: r.when, unless: r.unless ?? null, then: r.then, priority: r.priority, source })
      .returning({ id: schema.rules.id });
    ids.push(row!.id);
  }
  const changed = await reclassify(db, userId);
  await audit(userId, "user", "rules.add", ids.join(","), { count: rules.length });
  await processUser(userId);
  return { ids, changed };
}

export async function addRuleFromText(userId: string, text: string) {
  const parsed = parseRuleText(text);
  if (!parsed) return null;
  return { parsed, ...(await addRules(userId, parsed)) };
}

export async function listRules(userId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.rules)
    .where(and(eq(schema.rules.userId, userId), eq(schema.rules.active, true)))
    .orderBy(schema.rules.priority, schema.rules.createdAt);
  return rows.map((r) => ({ id: r.id, description: r.description, rule: { id: r.id, priority: r.priority, when: r.when, unless: r.unless, then: r.then } as Rule }));
}

export async function deleteRule(userId: string, id: string) {
  const db = await getDb();
  await db.update(schema.rules).set({ active: false }).where(and(eq(schema.rules.id, id), eq(schema.rules.userId, userId)));
  await reclassify(db, userId);
  await audit(userId, "user", "rules.delete", id);
  await processUser(userId);
}

export async function setRecurringStatus(userId: string, key: string, status: "active" | "ignored") {
  const db = await getDb();
  await db
    .update(schema.recurring)
    .set({ status, userConfirmed: status === "active" })
    .where(and(eq(schema.recurring.userId, userId), eq(schema.recurring.key, key)));
  await processUser(userId);
}

export async function listAccounts(userId: string) {
  const db = await getDb();
  return db
    .select({
      id: schema.accounts.id,
      name: schema.accounts.name,
      mask: schema.accounts.mask,
      type: schema.accounts.type,
      subtype: schema.accounts.subtype,
      businessId: schema.accounts.businessId,
      currentMinor: schema.accounts.currentMinor,
      hidden: schema.accounts.hidden,
      connectionId: schema.accounts.connectionId,
      institution: schema.connections.institutionName,
      status: schema.connections.status,
      lastSyncedAt: schema.connections.lastSyncedAt,
    })
    .from(schema.accounts)
    .leftJoin(schema.connections, and(eq(schema.connections.id, schema.accounts.connectionId), eq(schema.connections.userId, userId)))
    .where(eq(schema.accounts.userId, userId))
    .orderBy(schema.accounts.type, schema.accounts.name);
}
