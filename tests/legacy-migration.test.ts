import { sql, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret } from "@/server/crypto";
import { schema, type Db } from "@/server/db/client";
import { importLegacy, mapLegacyCategory } from "@/server/migration/legacy";
import { testDb } from "./helpers/db";

/** The final legacy schema (drizzle snapshot 0070), only the tables the import reads. */
const LEGACY_DDL = `
create table public.accounts (id text primary key, user_id text not null, plaid_account_id text, plaid_access_token text, name text not null, category text, current_balance text default '0', available_balance text, plaid_type text, is_from_plaid boolean not null default true);
create table public.categories (id text primary key, user_id text, name text, type text, plaid_category_id text, is_from_plaid boolean default false, budget_amount text, is_default boolean not null default false);
create table public.transactions (id text primary key, user_id text not null, amount text not null, payee text, notes text, date timestamp not null, account_id text not null references public.accounts(id) on delete cascade, category_id text references public.categories(id) on delete set null, is_from_plaid boolean not null default false, plaid_transaction_id text not null unique);
create table public.user_tokens (id text primary key, user_id text not null, access_token text not null, cursor text, item_id text, created_at timestamp default now());
create table public.categorization_rules (id text primary key, user_id text not null, category_id text not null references public.categories(id) on delete cascade, match_type text not null, match_value text not null, priority integer not null default 1, date timestamp not null);
create table public.goals (id text primary key, user_id text not null, goal_name text not null, target_amount text not null, start_date timestamp not null, goal_date timestamp not null, account_ids text not null, created_at timestamp not null default now(), updated_at timestamp not null default now());
`;

let db: Db;
const U = "user_legacy";

describe("legacy import (Scenario I)", () => {
  beforeAll(async () => {
    const t = await testDb();
    db = t.db;
    await t.client.exec(LEGACY_DDL);
    await t.client.exec(`
      insert into public.user_tokens values ('t1', '${U}', 'access-sandbox-legacy-secret', 'oldcursor', 'item_legacy', now());
      insert into public.accounts values
        ('a1', '${U}', 'plaid_chk', 'access-sandbox-legacy-secret', 'Checking', 'checking', '2450.10', '2400.00', 'depository', true),
        ('a2', '${U}', 'plaid_cc', 'access-sandbox-legacy-secret', 'Visa', 'credit card', '-830.55', '4169.45', 'credit', true),
        ('a3', '${U}', null, null, 'Cash jar', null, '120', null, null, false);
      insert into public.categories values ('c1', '${U}', 'Food/Drink', 'expense', null, true, '400', true), ('c2', '${U}', 'Rent', 'expense', null, false, '1800', false), ('c3', '${U}', 'My hobby', 'expense', null, false, null, false);
      insert into public.transactions values
        ('x1', '${U}', '3150.00', 'ACME PAYROLL', null, '2025-05-02', 'a1', null, true, 'p1'),
        ('x2', '${U}', '-1800', 'LANDLORD LLC', 'May rent', '2025-05-01', 'a1', 'c2', true, 'p2'),
        ('x3', '${U}', '-23.45', 'TST* NOPA', null, '2025-05-03', 'a2', 'c1', true, 'p3'),
        ('x4', '${U}', '-0.10', 'TINY', null, '2025-05-03', 'a2', 'c3', true, 'p4'),
        ('x5', '${U}', '-850.00', 'CHASE CREDIT CRD AUTOPAY', null, '2025-05-20', 'a1', null, true, 'p5'),
        ('x6', '${U}', '-250000', 'Seeded merchant', null, '2025-05-04', 'a3', null, false, 'manual1');
      insert into public.categorization_rules values ('r1', '${U}', 'c1', 'merchant_name', 'blue bottle', 2, now()), ('r2', '${U}', 'c1', 'plaid_primary_category', 'FOOD_AND_DRINK', 1, now());
      insert into public.goals values ('g1', '${U}', 'Emergency fund', '10000', '2025-01-01', '2026-01-01', '["a1"]', now(), now());
    `);
  });

  it("dry run writes nothing", async () => {
    const r = await importLegacy(db, { dryRun: true });
    expect(r.transactions).toBe(6);
    const n = await db.select().from(schema.transactions);
    expect(n).toHaveLength(0);
  });

  it("imports, reconciles totals exactly, and is idempotent", async () => {
    const first = await importLegacy(db);
    expect(first.reconciliation.every((r) => r.ok)).toBe(true);
    expect(first.flaggedAmounts).toBe(1);
    const second = await importLegacy(db);
    expect(second.reconciliation.every((r) => r.ok)).toBe(true);
    expect(await db.select().from(schema.transactions)).toHaveLength(6);
    expect(await db.select().from(schema.accounts)).toHaveLength(3);
  });

  it("converts conventions: debts positive, cents exact, categories mapped, card payments recognized", async () => {
    const accts = await db.select().from(schema.accounts);
    expect(accts.find((a) => a.name === "Visa")!.currentMinor).toBe(83055);
    const t = await db.select().from(schema.transactions);
    const by = (p: string) => t.find((x) => x.providerId === p)!;
    expect(by("p4").amountMinor).toBe(-10);
    expect(by("p3").category).toBe("dining");
    expect(by("p2").category).toBe("housing");
    expect(by("p2").note).toBe("May rent");
    expect(by("p5").kind).toBe("card_payment");
    expect(by("p4").legacyCategory).toBe("My hobby");
    expect(by("manual1").needsReview).toBe(true); // probable milliunits: flagged, not altered
    expect(by("manual1").amountMinor).toBe(-25_000_000);
  });

  it("re-encrypts tokens, imports user rules only, and keeps legacy tables untouched", async () => {
    const [c] = await db.select().from(schema.connections);
    expect(c!.accessTokenEnc).not.toMatch(/access-sandbox/);
    expect(decryptSecret(c!.accessTokenEnc, "item_legacy")).toBe("access-sandbox-legacy-secret");
    expect(c!.cursor).toBeNull();
    const rules = await db.select().from(schema.rules);
    expect(rules).toHaveLength(1);
    const goals = await db.select().from(schema.goals).where(eq(schema.goals.userId, U));
    expect(goals[0]!.kind).toBe("emergency_fund");
    expect(goals[0]!.targetMinor).toBe(1_000_000);
    const legacy = (await db.execute(sql`select count(*)::int as n from public.transactions`)) as unknown as { rows: { n: number }[] };
    expect(legacy.rows[0]!.n).toBe(6);
  });

  it("maps legacy category names", () => {
    expect(mapLegacyCategory("Food/Drink")).toBe("dining");
    expect(mapLegacyCategory("Government/Non Profit")).toBe("taxes");
    expect(mapLegacyCategory("Groceries")).toBe("groceries");
    expect(mapLegacyCategory("My hobby")).toBeNull();
  });
});
