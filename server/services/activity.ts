import { and, desc, eq, gte, ilike, isNull, lt, lte, or, sql } from "drizzle-orm";
import { type CategoryId, isCategoryId, type TransactionKind, TRANSACTION_KINDS } from "@/lib/finance/categories";
import type { Rule } from "@/lib/finance/classify";
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
    })
    .from(t)
    .innerJoin(schema.accounts, and(eq(schema.accounts.id, t.accountId), eq(schema.accounts.userId, userId)))
    .where(and(...conds))
    .orderBy(desc(t.date), desc(t.id))
    .limit(limit + 1);
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

export type TxnListRow = Awaited<ReturnType<typeof searchTransactions>>["rows"][number];

export async function getTransaction(userId: string, id: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.transactions)
    .where(and(eq(schema.transactions.id, id), eq(schema.transactions.userId, userId)));
  if (!row) return null;
  const [splits, history, pair] = await Promise.all([
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
  ]);
  return { ...row, splits, corrections: history, pair: pair.filter((p) => p.id !== id) };
}

/**
 * Correct a transaction. Stores before/after (reversible), locks the row
 * against automatic reclassification and, by default, teaches the merchant
 * mapping so future transactions follow.
 */
export async function correctTransaction(
  userId: string,
  id: string,
  change: { category: CategoryId; kind?: TransactionKind; applyToMerchant?: boolean; note?: string | null },
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
        reason: "You set this",
        needsReview: false,
        userLocked: true,
        ...(change.note !== undefined ? { note: change.note } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.transactions.id, id), eq(schema.transactions.userId, userId)));
  });
  let updatedOthers = 0;
  if (applyToMerchant) updatedOthers = await reclassify(db, userId, { merchantKey: row.merchantKey });
  await audit(userId, actor, "transaction.correct", id, { category: change.category, kind, applyToMerchant });
  await processUser(userId);
  return { kind, updatedOthers };
}

function inferKindForCategory(category: CategoryId, amount: Minor, current: TransactionKind): TransactionKind {
  if (category === "transfer") return "transfer";
  if (category === "card_payment") return "card_payment";
  if (category === "investment") return "investment_transfer";
  if (category === "paycheck" || category === "other_income" || category === "interest") return amount > 0 ? "income" : "expense";
  if (category === "fees") return "fee";
  if (current === "loan_payment") return "loan_payment";
  return amount > 0 ? "refund" : "expense";
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
