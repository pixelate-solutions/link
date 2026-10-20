import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { eq, getTableName, is, type SQL, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildMcpServer } from "@/server/ai/mcp";
import { apiIndex, ENDPOINTS, handleApiRequest } from "@/server/api/v1";
import { schema, type Db } from "@/server/db/client";
import { bearerToken, createApiToken, listApiTokens, revokeApiToken, verifyApiToken } from "@/server/services/api-tokens";
import { createUser, testDb } from "./helpers/db";
import { NOW, seedHousehold } from "./helpers/household";

let db: Db;
const A = "api_a";
const B = "api_b";

/** Raw SQL rows; the test database is PGlite, which returns `{ rows }`. */
async function query<T>(q: SQL) {
  return ((await db.execute(q)) as unknown as { rows: T[] }).rows;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are free-form JSON
type Body = { data: any; meta: any; error?: string };

async function get(userId: string, path: string) {
  const url = new URL(`http://link.test/api/v1/${path}`);
  const res = await handleApiRequest(userId, url.pathname.split("/").slice(3).filter(Boolean), url.searchParams);
  return { status: res.status, body: (await res.json()) as Body };
}

describe("API tokens", () => {
  beforeAll(async () => {
    ({ db } = await testDb());
    await createUser(db, "tok_a");
    await createUser(db, "tok_b");
  });

  it("verifies a new token, stores only its hash, and stops working once revoked", async () => {
    const t = await createApiToken("tok_a", "  Claude  ");
    expect(t.token).toMatch(/^link_[A-Za-z0-9_-]{43}$/);
    expect(t.name).toBe("Claude");
    expect(await verifyApiToken(t.token)).toBe("tok_a");
    const [row] = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, t.id));
    expect(JSON.stringify(row)).not.toContain(t.token);
    expect(row!.lastUsedAt).not.toBeNull();

    // Another user can't revoke it.
    await revokeApiToken("tok_b", t.id);
    expect(await verifyApiToken(t.token)).toBe("tok_a");
    await revokeApiToken("tok_a", t.id);
    expect(await verifyApiToken(t.token)).toBeNull();
    expect(await listApiTokens("tok_a")).toEqual([]);
  });

  it("rejects unknown, altered and non-Link tokens", async () => {
    const t = await createApiToken("tok_b", "script");
    expect(await verifyApiToken(t.token.slice(0, -1) + (t.token.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(await verifyApiToken("link_nope")).toBeNull();
    expect(await verifyApiToken("sk_live_something")).toBeNull();
    expect(await verifyApiToken("")).toBeNull();
  });

  it("only reads Link tokens from a Bearer header", () => {
    const req = (h?: string) => new Request("http://link.test", { headers: h ? { authorization: h } : {} });
    expect(bearerToken(req("Bearer link_abc"))).toBe("link_abc");
    expect(bearerToken(req("bearer link_abc"))).toBe("link_abc");
    expect(bearerToken(req("Bearer sk_abc"))).toBeNull();
    expect(bearerToken(req("Basic link_abc"))).toBeNull();
    expect(bearerToken(req())).toBeNull();
  });

  it("caps active tokens per user", async () => {
    await createUser(db, "tok_many");
    for (let i = 0; i < 20; i++) await createApiToken("tok_many", `t${i}`);
    await expect(createApiToken("tok_many", "one more")).rejects.toThrow(/up to 20/);
  });
});

describe("REST API v1", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    ({ db } = await testDb());
    await seedHousehold(db, A);
    await createUser(db, B);
  }, 120_000);

  it("describes every endpoint in the public index", () => {
    const index = apiIndex("https://link.test");
    expect(index.endpoints.map((e) => e.path)).toEqual(expect.arrayContaining(["/api/v1/transactions", "/api/v1/accounts/{id}", "/api/v1/overview", "/api/v1/budget"]));
    expect(index.endpoints).toHaveLength(ENDPOINTS.length);
    expect(index.conventions.money).toMatch(/cents/);
  });

  it("serves every collection endpoint for a real household without writing anything", async () => {
    // A fingerprint of every row in every table (except the token table, whose last-used time may move).
    const tables = (Object.values(schema) as unknown[])
      .filter((t): t is PgTable => is(t, PgTable))
      .map((t) => getTableName(t))
      .filter((n) => n !== "api_tokens");
    const fingerprint = async () =>
      Object.fromEntries(
        await Promise.all(tables.map(async (n) => [n, (await query<{ h: string }>(sql.raw(`select md5(coalesce(string_agg(r::text, '|' order by r::text), '')) as h from link.${n} r`)))[0]!.h])),
      );
    const before = await fingerprint();
    for (const e of ENDPOINTS.filter((e) => !e.path.includes(":id"))) {
      const r = await get(A, e.path);
      expect(r.status, e.path).toBe(200);
      expect(r.body.data, e.path).toBeDefined();
      expect(r.body.meta.money).toMatch(/cents/);
    }
    expect(await fingerprint()).toEqual(before);
  }, 60_000);

  it("returns the numbers the app shows", async () => {
    const overview = (await get(A, "overview")).body.data;
    expect(overview.position.cash).toBeGreaterThan(0);
    expect(overview.coverage.transactions).toBeGreaterThan(0);
    const budget = (await get(A, "budget")).body.data;
    expect(budget.lines.length).toBeGreaterThan(0);
    expect(budget.plannedThisMonth).toBe(overview.budget.plannedThisMonth);
    const forecast = (await get(A, "forecast")).body.data;
    expect(forecast.safeToSpend).toEqual(overview.safeToSpend);
    const categories = (await get(A, "categories")).body.data;
    expect(categories.categories.map((c: { id: string }) => c.id)).toContain("groceries");
  });

  it("pages through every transaction with the cursor, newest first, no repeats", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let last = "9999-12-31";
    do {
      const r: Awaited<ReturnType<typeof get>> = await get(A, `transactions?limit=7${cursor ? `&cursor=${cursor}` : ""}`);
      expect(r.status).toBe(200);
      for (const t of r.body.data) {
        expect(t.date <= last).toBe(true);
        last = t.date;
        seen.push(t.id);
      }
      cursor = r.body.meta.nextCursor;
    } while (cursor);
    const [{ n }] = (await query<{ n: number }>(sql`select count(*)::int as n from link.transactions where user_id = ${A} and removed_at is null`)) as [{ n: number }];
    expect(seen).toHaveLength(n);
    expect(new Set(seen).size).toBe(n);
  });

  it("filters transactions and rejects bad parameters", async () => {
    const groceries = (await get(A, "transactions?category=groceries&limit=200")).body.data;
    expect(groceries.length).toBeGreaterThan(0);
    expect(groceries.every((t: { category: string }) => t.category === "groceries")).toBe(true);
    const ranged = (await get(A, "transactions?from=2026-09-01&to=2026-09-30&minAmount=10000&limit=200")).body.data;
    expect(ranged.every((t: { date: string; amount: number }) => t.date >= "2026-09-01" && t.date <= "2026-09-30" && Math.abs(t.amount) >= 10000)).toBe(true);
    expect((await get(A, "transactions?category=nonsense")).status).toBe(400);
    expect((await get(A, "transactions?from=yesterday")).status).toBe(400);
    expect((await get(A, "transactions?limit=5000")).status).toBe(400);
    expect((await get(A, "transactions?cursor=garbage")).status).toBe(400);
    expect((await get(A, "debt?extraMonthly=-5")).status).toBe(400);
  });

  it("returns one transaction and one account in full", async () => {
    const [t] = (await get(A, "transactions?limit=1")).body.data;
    const one = await get(A, `transactions/${t.id}`);
    expect(one.status).toBe(200);
    expect(one.body.data.id).toBe(t.id);
    expect(one.body.data.account.name).toBe(t.accountName);
    const [acct] = (await get(A, "accounts")).body.data;
    const a = await get(A, `accounts/${acct.id}`);
    expect(a.status).toBe(200);
    expect(Array.isArray(a.body.data.balanceHistory)).toBe(true);
    expect(JSON.stringify((await get(A, "connections")).body)).not.toMatch(/accessToken|cursor|itemId/);
  });

  it("never shows one user another user's data", async () => {
    const [t] = (await get(A, "transactions?limit=1")).body.data;
    const [acct] = (await get(A, "accounts")).body.data;
    expect((await get(B, "transactions")).body.data).toEqual([]);
    expect((await get(B, "accounts")).body.data).toEqual([]);
    expect((await get(B, `transactions/${t.id}`)).status).toBe(404);
    expect((await get(B, `accounts/${acct.id}`)).status).toBe(404);
    expect((await get(B, "overview")).body.data.coverage.accounts).toBe(0);
  });

  it("404s unknown paths and malformed ids", async () => {
    expect((await get(A, "nope")).status).toBe(404);
    expect((await get(A, "transactions/not-a-uuid")).status).toBe(404);
    expect((await get(A, "transactions/00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await get(A, "conversations/00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  it("gives token MCP sessions only the read-only tools", async () => {
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await buildMcpServer(A, { readOnly: true }).connect(st);
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(ct);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["get_financial_overview", "search_transactions", "get_goals"]));
    for (const banned of ["run_scenario", "save_fact", "remember", "propose_goal", "propose_rule"]) expect(names).not.toContain(banned);
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
  });
});
