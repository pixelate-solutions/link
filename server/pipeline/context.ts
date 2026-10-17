import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { TransactionKind } from "@/lib/finance/categories";
import { type ClassifyContext, type LearnedMapping, type Rule, toCategoryId } from "@/lib/finance/classify";
import type { Db, Tx } from "../db/client";
import { schema } from "../db/client";

/** Load everything the classifier needs for one user, in three queries. */
export async function loadClassifyContext(db: Db | Tx, userId: string): Promise<ClassifyContext> {
  const [ruleRows, correctionRows, historyRows] = await Promise.all([
    db.select().from(schema.rules).where(and(eq(schema.rules.userId, userId), eq(schema.rules.active, true))),
    db
      .select({ merchantKey: schema.corrections.merchantKey, after: schema.corrections.after })
      .from(schema.corrections)
      .where(and(eq(schema.corrections.userId, userId), isNull(schema.corrections.revertedAt)))
      .orderBy(desc(schema.corrections.createdAt)),
    db
      .select({
        merchantKey: schema.transactions.merchantKey,
        category: schema.transactions.category,
        kind: schema.transactions.kind,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.transactions)
      .where(and(eq(schema.transactions.userId, userId), isNull(schema.transactions.removedAt), gte(schema.transactions.confidence, 0.85)))
      .groupBy(schema.transactions.merchantKey, schema.transactions.category, schema.transactions.kind),
  ]);

  const rules: Rule[] = ruleRows.map((r) => ({
    id: r.id,
    priority: r.priority,
    when: r.when as Rule["when"],
    unless: (r.unless ?? undefined) as Rule["unless"],
    then: r.then as Rule["then"],
  }));

  const learned = new Map<string, LearnedMapping>();
  for (const c of correctionRows) {
    const after = c.after as { category?: string; kind?: TransactionKind; applyToMerchant?: boolean; direction?: "in" | "out" };
    const key = after.direction ? `${c.merchantKey}|${after.direction}` : c.merchantKey;
    if (learned.has(key)) continue; // newest wins
    const category = toCategoryId(after.category);
    if (category && after.kind && after.applyToMerchant !== false) learned.set(key, { category, kind: after.kind });
  }

  const history = new Map<string, LearnedMapping & { count: number }>();
  for (const h of historyRows) {
    const category = toCategoryId(h.category);
    if (!category) continue;
    const prev = history.get(h.merchantKey);
    if (!prev || h.n > prev.count) history.set(h.merchantKey, { category, kind: h.kind as TransactionKind, count: h.n });
  }
  return { rules, learned, history };
}
