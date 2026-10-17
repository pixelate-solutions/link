import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { classify, type AccountType } from "@/lib/finance/classify";
import { interpretGoals } from "@/lib/finance/goals";
import { toMinor } from "@/lib/finance/money";
import { categoryFromWords } from "@/lib/finance/rules";
import type { CategoryId } from "@/lib/finance/categories";
import { encryptSecret } from "../crypto";
import { type Db, schema } from "../db/client";

/**
 * One-way, non-destructive import from the legacy `public` tables into the
 * `link` schema. Never modifies or deletes legacy rows. Idempotent: ids are
 * derived from legacy ids, so re-running inserts nothing new.
 * See docs/DATABASE_MIGRATION.md.
 */

/** Stable UUID for a legacy row so repeated imports collide instead of duplicating. */
export function legacyUuid(table: string, id: string): string {
  const h = createHash("sha256").update(`link-legacy:${table}:${id}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Map a legacy (user-named) category to the fixed taxonomy. */
export function mapLegacyCategory(name: string | null | undefined): CategoryId | null {
  if (!name) return null;
  const n = name.toLowerCase();
  const direct: Record<string, CategoryId> = {
    "food/drink": "dining",
    "food and drink": "dining",
    "rent/utilities": "utilities",
    "rent and utilities": "utilities",
    "general merchandise": "shopping",
    "general services": "services",
    "government/non-profit": "taxes",
    "government/non profit": "taxes",
    "loan payments": "debt_interest",
    "bank fees": "fees",
    "home improvement": "home",
    "transfer in": "transfer",
    "transfer out": "transfer",
    medical: "healthcare",
    clothing: "shopping",
    food: "groceries",
    rent: "housing",
  };
  return direct[n] ?? categoryFromWords(n);
}

interface Report {
  users: number;
  connections: number;
  accounts: number;
  transactions: number;
  rules: number;
  goals: number;
  flaggedAmounts: number;
  reconciliation: { accountId: string; legacyCount: number; importedCount: number; legacyTotalMinor: number; importedTotalMinor: number; ok: boolean }[];
}

type Row = Record<string, unknown>;

async function rows(db: Db, query: ReturnType<typeof sql>): Promise<Row[]> {
  const r = (await db.execute(query)) as unknown as { rows?: Row[] } | Row[];
  return Array.isArray(r) ? r : (r.rows ?? []);
}

async function tableExists(db: Db, name: string) {
  const r = await rows(db, sql`select to_regclass(${`public.${name}`}) as t`);
  return Boolean(r[0]?.t);
}

/** Legacy `timestamp` (no zone) values arrive as local-time Dates; keep their wall-clock date. */
const toDate = (v: unknown) => {
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  return String(v).slice(0, 10);
};

/**
 * The legacy app never set plaid_type reliably (a backfill marked every early account
 * "depository"), so infer the type from names first, then from the balance sign.
 */
export function inferLegacyType(a: { name?: unknown; category?: unknown; plaid_type?: unknown; current_balance?: unknown }): AccountType {
  const text = `${a.name ?? ""} ${a.category ?? ""}`.toLowerCase();
  if (/\b(mortgage|student|loan|heloc|auto loan|line of credit)\b/.test(text)) return "loan";
  if (/\b(credit|card|visa|mastercard|amex|american express|discover|sapphire)\b/.test(text)) return "credit";
  if (/\b(401k|401\(k\)|ira|roth|brokerage|invest|403b|hsa|retirement)\b/.test(text)) return "investment";
  const t = String(a.plaid_type ?? "").toLowerCase();
  if (t === "credit" || t === "loan" || t === "investment") return t;
  return Number(a.current_balance ?? 0) < 0 ? "credit" : "depository";
}

export async function importLegacy(db: Db, opts: { dryRun?: boolean; userId?: string } = {}): Promise<Report> {
  const report: Report = { users: 0, connections: 0, accounts: 0, transactions: 0, rules: 0, goals: 0, flaggedAmounts: 0, reconciliation: [] };
  if (!(await tableExists(db, "accounts")) || !(await tableExists(db, "transactions"))) return report;
  const only = (alias: string) => (opts.userId ? sql.raw(`and ${alias}.user_id = '${opts.userId.replace(/'/g, "''")}'`) : sql``);

  const [legacyAccounts, legacyTxns, legacyCats, legacyTokens] = await Promise.all([
    rows(db, sql`select * from public.accounts a where true ${only("a")}`),
    rows(db, sql`select * from public.transactions t where true ${only("t")}`),
    rows(db, sql`select * from public.categories c where true ${only("c")}`),
    (await tableExists(db, "user_tokens")) ? rows(db, sql`select * from public.user_tokens u where true ${only("u")}`) : Promise.resolve([] as Row[]),
  ]);
  const legacyRules = (await tableExists(db, "categorization_rules")) ? await rows(db, sql`select * from public.categorization_rules r where true ${only("r")}`) : [];
  const legacyGoals = (await tableExists(db, "goals")) ? await rows(db, sql`select * from public.goals g where true ${only("g")}`) : [];

  const userIds = [...new Set([...legacyAccounts, ...legacyTxns, ...legacyGoals, ...legacyTokens, ...legacyRules].map((r) => String(r.user_id)).filter(Boolean))];
  const catName = new Map(legacyCats.map((c) => [String(c.id), (c.name as string | null) ?? null]));

  const run = async (tx: Db) => {
    for (const u of userIds) {
      await tx.insert(schema.users).values({ id: u }).onConflictDoNothing();
      report.users++;
    }
    // Connections: one per legacy item, token re-encrypted with the item id as context.
    const connByToken = new Map<string, string>();
    for (const t of legacyTokens) {
      const itemId = (t.item_id as string | null) ?? `legacy_${t.id}`;
      const id = legacyUuid("user_tokens", itemId);
      connByToken.set(String(t.access_token), id);
      await tx
        .insert(schema.connections)
        .values({
          id,
          userId: String(t.user_id),
          itemId,
          accessTokenEnc: encryptSecret(String(t.access_token), itemId),
          // Cursors from the old sync are not trusted: a fresh sync rebuilds idempotently.
          cursor: null,
          status: t.item_id ? "active" : "error",
          errorCode: t.item_id ? null : "LEGACY_MISSING_ITEM",
        })
        .onConflictDoNothing();
      report.connections++;
    }

    const acctMeta = new Map<string, { id: string; type: AccountType; subtype: string | null; userId: string }>();
    for (const a of legacyAccounts) {
      const type = inferLegacyType(a);
      const id = legacyUuid("accounts", String(a.id));
      const toAmt = (v: unknown) => (v == null || v === "" ? null : toMinor(String(v)));
      const current = toAmt(a.current_balance);
      await tx
        .insert(schema.accounts)
        .values({
          id,
          userId: String(a.user_id),
          connectionId: a.plaid_access_token ? (connByToken.get(String(a.plaid_access_token)) ?? null) : null,
          providerAccountId: (a.plaid_account_id as string | null) ?? `legacy_${a.id}`,
          name: String(a.name),
          type,
          subtype: (a.category as string | null) ?? null,
          // Legacy stored debts as negative numbers; Link stores amounts owed as positive.
          currentMinor: current == null ? null : type === "credit" || type === "loan" ? Math.abs(current) : current,
          availableMinor: toAmt(a.available_balance),
          balanceAsOf: null,
          source: a.is_from_plaid ? "plaid" : "legacy",
        })
        .onConflictDoNothing();
      acctMeta.set(String(a.id), { id, type, subtype: (a.category as string | null) ?? null, userId: String(a.user_id) });
      report.accounts++;
    }

    const values: (typeof schema.transactions.$inferInsert)[] = [];
    for (const t of legacyTxns) {
      const acct = acctMeta.get(String(t.account_id));
      if (!acct) continue;
      const amount = toMinor(String(t.amount));
      // Seed and CSV paths stored milliunits; never silently divide, flag instead.
      const suspicious = !t.is_from_plaid && Number.isInteger(Number(t.amount)) && Math.abs(Number(t.amount)) >= 100_000;
      const name = String(t.payee ?? "Unknown");
      const c = classify({ amount, name, accountId: acct.id, accountType: acct.type, accountSubtype: acct.subtype });
      const legacyCat = catName.get(String(t.category_id)) ?? null;
      const mapped = mapLegacyCategory(legacyCat);
      const structural = c.source === "structural";
      values.push({
        id: legacyUuid("transactions", String(t.id)),
        userId: String(t.user_id),
        accountId: acct.id,
        providerId: String(t.plaid_transaction_id ?? `legacy_${t.id}`),
        amountMinor: amount,
        date: toDate(t.date),
        pending: false,
        name,
        merchant: c.merchant,
        merchantKey: c.merchantKey,
        kind: c.kind,
        category: !structural && mapped ? mapped : c.category,
        classSource: !structural && mapped ? "legacy" : c.source,
        confidence: !structural && mapped ? 0.8 : c.confidence,
        reason: !structural && mapped ? `Category carried over from your old setup (${legacyCat})` : c.reason,
        needsReview: suspicious || c.needsReview,
        note: (t.notes as string | null) ?? null,
        legacyCategory: legacyCat,
        source: "legacy",
      });
      if (suspicious) report.flaggedAmounts++;
    }
    for (let i = 0; i < values.length; i += 500) await tx.insert(schema.transactions).values(values.slice(i, i + 500)).onConflictDoNothing();
    report.transactions = values.length;

    for (const r of legacyRules) {
      const matchType = String(r.match_type);
      if (Number(r.priority) < 2 || !["merchant_name", "transaction_name", "transaction_description"].includes(matchType)) continue;
      const cat = mapLegacyCategory(catName.get(String(r.category_id)));
      if (!cat) continue;
      await tx
        .insert(schema.rules)
        .values({
          id: legacyUuid("rules", String(r.id)),
          userId: String(r.user_id),
          description: `${r.match_value} → ${cat} (from your old rules)`,
          when: { merchant: String(r.match_value) },
          then: { category: cat },
          priority: 50,
          source: "legacy",
        })
        .onConflictDoNothing();
      report.rules++;
    }

    for (const g of legacyGoals) {
      const name = String(g.goal_name);
      const interp = interpretGoals(name, toDate(g.start_date ?? new Date()))[0]!;
      const target = g.target_amount ? toMinor(String(g.target_amount)) : null;
      await tx
        .insert(schema.goals)
        .values({
          id: legacyUuid("goals", String(g.id)),
          userId: String(g.user_id),
          statement: name,
          kind: interp.kind === "custom" ? "savings_target" : interp.kind,
          title: name.slice(0, 40),
          interpretation: { ...interp, target: { ...interp.target, ...(target ? { amount: target } : {}), ...(g.goal_date ? { date: toDate(g.goal_date) } : {}) } },
          targetMinor: target,
          targetDate: g.goal_date ? toDate(g.goal_date) : null,
        })
        .onConflictDoNothing();
      report.goals++;
    }
  };

  if (opts.dryRun) {
    // Run inside a transaction and roll back, so the dry run exercises every insert and the reconciliation.
    try {
      await db.transaction(async (tx) => {
        await run(tx as unknown as Db);
        await reconcile(tx as unknown as Db, legacyAccounts, legacyTxns, report);
        throw new DryRun();
      });
    } catch (e) {
      if (!(e instanceof DryRun)) throw e;
    }
  } else {
    await db.transaction(async (tx) => {
      await run(tx as unknown as Db);
      await reconcile(tx as unknown as Db, legacyAccounts, legacyTxns, report);
      // Any mismatch aborts the whole import: nothing is written.
      if (report.reconciliation.some((r) => !r.ok)) throw new Error("Legacy import reconciliation failed; rolled back");
    });
  }
  return report;
}

/** Per legacy account: transaction count and exact cent total, legacy vs imported. */
async function reconcile(db: Db, legacyAccounts: Row[], legacyTxns: Row[], report: Report) {
  report.reconciliation = [];
  for (const a of legacyAccounts) {
    const legacyId = String(a.id);
    const l = legacyTxns.filter((t) => String(t.account_id) === legacyId);
    const legacyTotalMinor = l.reduce((s, t) => s + toMinor(String(t.amount)), 0);
    const [r] = await rows(db, sql`select count(*)::int as n, coalesce(sum(amount_minor), 0)::bigint as total from link.transactions where account_id = ${legacyUuid("accounts", legacyId)} and source = 'legacy'`);
    const importedCount = Number(r!.n);
    const importedTotalMinor = Number(r!.total);
    report.reconciliation.push({ accountId: legacyId, legacyCount: l.length, importedCount, legacyTotalMinor, importedTotalMinor, ok: l.length === importedCount && legacyTotalMinor === importedTotalMinor });
  }
}

class DryRun extends Error {}
