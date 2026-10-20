import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { eq, getTableName, is, type SQL, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildMcpServer } from "@/server/ai/mcp";
import { apiIndex, ENDPOINTS, handleApiRequest, type Method } from "@/server/api/v1";
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

async function call(userId: string, method: Method, path: string, body?: unknown, canWrite = true) {
  const url = new URL(`http://link.test/api/v1/${path}`);
  const res = await handleApiRequest({ userId, method, segments: url.pathname.split("/").slice(3).filter(Boolean), query: url.searchParams, body, canWrite, tokenId: undefined });
  return { status: res.status, body: (await res.json()) as Body, headers: res.headers };
}
const get = (userId: string, path: string) => call(userId, "GET", path, undefined, false);

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
    expect(await verifyApiToken(t.token)).toEqual({ userId: "tok_a", tokenId: t.id, access: "read" });
    const [row] = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, t.id));
    expect(JSON.stringify(row)).not.toContain(t.token);
    expect(row!.lastUsedAt).not.toBeNull();

    // Another user can't revoke it.
    await revokeApiToken("tok_b", t.id);
    expect((await verifyApiToken(t.token))?.userId).toBe("tok_a");
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

  it("records whether a token can write", async () => {
    const t = await createApiToken("tok_a", "agent", "write");
    expect((await verifyApiToken(t.token))?.access).toBe("write");
    expect((await listApiTokens("tok_a")).find((x) => x.id === t.id)?.access).toBe("write");
    await revokeApiToken("tok_a", t.id);
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
    // A fingerprint of every row in every table, except the token table (last-used time may move)
    // and the audit log (/export records that it ran).
    const tables = (Object.values(schema) as unknown[])
      .filter((t): t is PgTable => is(t, PgTable))
      .map((t) => getTableName(t))
      .filter((n) => n !== "api_tokens" && n !== "audit_log");
    const fingerprint = async () =>
      Object.fromEntries(
        await Promise.all(tables.map(async (n) => [n, (await query<{ h: string }>(sql.raw(`select md5(coalesce(string_agg(r::text, '|' order by r::text), '')) as h from link.${n} r`)))[0]!.h])),
      );
    const before = await fingerprint();
    for (const e of ENDPOINTS.filter((e) => (e.method ?? "GET") === "GET" && !e.path.includes(":"))) {
      const r = await get(A, e.path);
      expect(r.status, e.path).toBe(200);
      expect(r.body.data, e.path).toBeDefined();
      expect(r.body.meta.money).toMatch(/cents/);
    }
    expect(await fingerprint()).toEqual(before);
    const [exported] = await query<{ n: number }>(sql`select count(*)::int as n from link.audit_log where user_id = ${A} and action = 'account.export'`);
    expect(exported!.n).toBe(1);
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
    expect((await get(A, "transactions?from=2026-09-31")).status).toBe(400);
    expect((await get(A, "transactions?from=2026-13-01")).status).toBe(400);
    expect((await get(A, `transactions?cursor=${Buffer.from("2026-02-30|00000000-0000-4000-8000-000000000000").toString("base64url")}`)).status).toBe(400);
    expect((await get(A, "transactions?limit=&review=&q=")).body.data.length).toBeGreaterThan(0);
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

  it("returns everything the bank sent, including the full mortgage terms", async () => {
    const accounts = (await get(A, "accounts")).body.data as { name: string; plaid: Body["data"]; subtype: string; institution: string }[];
    const mortgage = accounts.find((a) => a.subtype === "mortgage")!;
    expect(mortgage.plaid.liability).toMatchObject({
      type: "mortgage",
      escrow_balance: 3141.5,
      maturity_date: "2052-04-01",
      origination_principal_amount: 312000,
      ytd_interest_paid: 14210.12,
      property_address: { city: "Springfield" },
      interest_rate: { percentage: 6.25, type: "fixed" },
    });
    expect(mortgage.plaid.account.mask).toBe("6666");
    expect(accounts.find((a) => a.subtype === "credit card" && a.plaid.liability)!.plaid.liability.aprs[0].apr_percentage).toBe(22.49);

    const [t] = (await get(A, "transactions?limit=1")).body.data;
    expect(t.plaid.transaction_id).toBe(t.providerId);
    expect(t.authorizedDate !== undefined && t.paymentChannel !== undefined).toBe(true);
    expect((await get(A, `transactions/${t.id}`)).body.data.plaid.transaction_id).toBe(t.providerId);
  });

  it("names every account in the overview, with Home's spending card and layout", async () => {
    const o = (await get(A, "overview")).body.data;
    expect(o.accounts).toHaveLength(o.coverage.accounts);
    expect(o.accounts.find((a: { subtype: string }) => a.subtype === "mortgage")).toMatchObject({ institution: "Fixture Bank", balance: 285400_00, apr: 6.25 });
    expect(o.spending).toMatchObject({ planned: o.budget.plannedThisMonth, status: expect.stringMatching(/on_track|spending_fast|over_plan/) });
    expect(["empty", "syncing", "shortfall", "new", "steady"]).toContain(o.homeMode);
    expect((await get(A, "budget")).body.data.summary).toEqual(o.spending);
  });

  it("returns Needs a look as the app groups it, with the question Link asks", async () => {
    const r = (await get(A, "review")).body;
    expect(r.meta.count).toBe((await get(A, "overview")).body.data.coverage.reviewCount);
    if (r.data.length) {
      const g = r.data[0];
      expect(g.question).toMatch(/\?$/);
      expect(g.ids).toHaveLength(g.count);
      expect(g.total).toBe(g.transactions.reduce((s: number, t: { amount: number }) => s + t.amount, 0));
    }
  });

  it("returns tokens, history, the assistant's activity and chat files", async () => {
    const t = await createApiToken(A, "listed", "write");
    const tokens = (await get(A, "tokens")).body.data;
    expect(tokens.find((x: { id: string }) => x.id === t.id)).toMatchObject({ name: "listed", access: "write" });
    expect(JSON.stringify(tokens)).not.toMatch(/hash|link_[A-Za-z0-9_-]{20,}/);
    const history = (await get(A, "history")).body;
    expect(history.data.map((h: { action: string; target: string }) => `${h.action} ${h.target}`)).toContain(`api_token.create ${t.id}`);
    expect((await get(A, "history?limit=1")).body.data).toHaveLength(1);
    expect((await get(A, "history?cursor=nope")).status).toBe(400);
    // Paging returns every entry exactly once.
    const all = (await get(A, "history?limit=500")).body.data.map((h: { id: number }) => h.id);
    const paged: number[] = [];
    let cursor: number | null = null;
    do {
      const r: Awaited<ReturnType<typeof get>> = await get(A, `history?limit=2${cursor ? `&cursor=${cursor}` : ""}`);
      paged.push(...r.body.data.map((h: { id: number }) => h.id));
      cursor = r.body.meta.nextCursor;
    } while (cursor);
    expect(paged).toEqual(all);
    expect((await get(A, "assistant")).body.data).toMatchObject({ runs: expect.any(Array), toolCalls: expect.any(Array) });

    const { saveUpload } = await import("@/server/services/attachments");
    const file = await saveUpload(A, { name: "notes.txt", type: "text/plain", bytes: Buffer.from("hello from a chat") });
    const url = new URL(`http://link.test/api/v1/attachments/${file.id}`);
    const res = await handleApiRequest({ userId: A, method: "GET", segments: ["attachments", file.id], query: url.searchParams, canWrite: false });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    expect(await res.text()).toBe("hello from a chat");
    expect((await get(B, `attachments/${file.id}`)).status).toBe(404);
  });

  it("exports every table, never a token hash", async () => {
    const e = (await get(A, "export")).body.data;
    for (const k of ["proposals", "goalProgress", "balanceHistory", "toolCalls", "agentRuns", "auditLog", "apiTokens", "accounts", "transactions"]) expect(e, k).toHaveProperty(k);
    expect(e.balanceHistory.length).toBeGreaterThan(0);
    expect(e.apiTokens.every((t: object) => !("hash" in t))).toBe(true);
    expect(e.accounts.find((a: { subtype: string }) => a.subtype === "mortgage").plaid.liability.escrow_balance).toBe(3141.5);
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

describe("REST API v1 writes", () => {
  const W = "api_w";
  const O = "api_other";
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    ({ db } = await testDb());
    await seedHousehold(db, W);
    await seedHousehold(db, O);
  }, 120_000);

  const txns = async (userId: string, q = "limit=200") => (await get(userId, `transactions?${q}`)).body.data as { id: string; category: string; amount: number; merchantKey: string; note: string | null }[];

  it("refuses every change from a read-only token, and changes nothing", async () => {
    const [t] = await txns(W, "limit=1");
    const r = await call(W, "PATCH", `transactions/${t!.id}`, { category: "travel" }, false);
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/read-only/);
    expect((await get(W, `transactions/${t!.id}`)).body.data.category).toBe(t!.category);
    for (const e of ENDPOINTS.filter((e) => (e.method ?? "GET") !== "GET")) {
      const path = e.path.replace(":id", "00000000-0000-4000-8000-000000000000").replace(":key", "groceries");
      expect((await call(W, e.method!, path, {}, false)).status, `${e.method} ${e.path}`).toBe(403);
    }
  });

  it("recategorizes one transaction, records who did it, and can undo it", async () => {
    const t = (await txns(W)).find((x) => x.category !== "travel")!;
    const r = await call(W, "PATCH", `transactions/${t.id}`, { category: "travel", applyToMerchant: false, note: "  Conference trip " });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ id: t.id, category: "travel", note: "Conference trip", userLocked: true, needsReview: false });
    expect((await get(W, `transactions/${t.id}`)).body.data.category).toBe("travel");
    const [logged] = await query<{ n: number }>(sql`select count(*)::int as n from link.audit_log where user_id = ${W} and action = 'api.write' and meta->>'path' = ${`transactions/${t.id}`}`);
    expect(logged!.n).toBe(1);

    expect((await call(W, "PATCH", `transactions/${t.id}`, { note: null })).body.data.note).toBeNull();
    const undone = await call(W, "POST", `transactions/${t.id}/revert`);
    expect(undone.status).toBe(200);
    expect(undone.body.data.category).toBe(t.category);
    expect(undone.body.data.userLocked).toBe(false);
    expect((await call(W, "POST", `transactions/${t.id}/revert`)).status).toBe(422);
  });

  it("changes only the named payment for Zelle and the like, and never takes a kind", async () => {
    const zelle = (await txns(W)).filter((x) => x.merchantKey.startsWith("zelle") && x.category !== "childcare");
    expect(zelle.length).toBeGreaterThan(1);
    const r = await call(W, "PATCH", `transactions/${zelle[0]!.id}`, { category: "childcare" });
    expect(r.status).toBe(200);
    expect(r.body.meta.updatedOthers).toBe(0);
    for (const z of zelle.slice(1)) expect((await get(W, `transactions/${z.id}`)).body.data.category).toBe(z.category);
    expect((await call(W, "POST", "transactions/categorize", { ids: [zelle[1]!.id], category: "childcare" })).body.data.updatedOthers).toBe(0);
    expect((await call(W, "PATCH", `transactions/${zelle[0]!.id}`, { category: "groceries", kind: "transfer" })).status).toBe(400);
  });

  it("recategorizes many at once, all or nothing", async () => {
    const pick = (await txns(W)).filter((x) => x.amount < 0 && x.category !== "gifts").slice(0, 4);
    const ids = pick.map((x) => x.id);
    const before = await txns(W);

    // One bad id: nothing changes.
    const bad = await call(W, "POST", "transactions/categorize", { ids: [...ids, "00000000-0000-4000-8000-000000000000"], category: "gifts" });
    expect(bad.status).toBe(404);
    expect(await txns(W)).toEqual(before);
    expect((await call(W, "POST", "transactions/categorize", { ids, category: "nonsense" })).status).toBe(400);
    expect((await call(W, "POST", "transactions/categorize", { ids, category: "gifts", typo: true })).status).toBe(400);

    const ok = await call(W, "POST", "transactions/categorize", { ids, category: "gifts", applyToMerchant: false });
    expect(ok.status).toBe(200);
    expect(ok.body.data.updated).toBe(ids.length);
    for (const id of ids) expect((await get(W, `transactions/${id}`)).body.data).toMatchObject({ category: "gifts", userLocked: true });
    // The live picture moved too.
    expect((await get(W, "transactions?category=gifts&limit=200")).body.data.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining(ids));
  });

  it("splits a transaction, rejects parts that don't add up, and unsplits", async () => {
    const t = (await txns(W)).find((x) => x.amount <= -2000)!;
    const half = Math.trunc(t.amount / 2);
    expect((await call(W, "PUT", `transactions/${t.id}/splits`, { splits: [{ amount: half, category: "groceries" }, { amount: half - 1, category: "dining" }] })).status).toBe(422);
    const r = await call(W, "PUT", `transactions/${t.id}/splits`, { splits: [{ amount: half, category: "groceries" }, { amount: t.amount - half, category: "dining" }] });
    expect(r.status).toBe(200);
    expect(r.body.data.splits).toHaveLength(2);
    expect((await call(W, "PUT", `transactions/${t.id}/splits`, { splits: [] })).body.data.splits).toEqual([]);
  });

  it("sets and resets the budget", async () => {
    const r = await call(W, "PUT", "budget/groceries", { amount: 123_45 });
    expect(r.status).toBe(200);
    expect(r.body.data.lines.find((l: { category: string }) => l.category === "groceries").monthly).toBe(123_45);
    expect((await get(W, "budget")).body.data.custom).toBe(true);
    expect((await call(W, "PUT", "budget/nonsense", { amount: 1 })).status).toBe(404);
    expect((await call(W, "PUT", "budget/groceries", { amount: -1 })).status).toBe(400);
    expect((await call(W, "PUT", "budget/groceries", { amount: 1.5 })).status).toBe(400);
    expect((await call(W, "DELETE", "budget")).status).toBe(200);
    expect((await get(W, "budget")).body.data.lines.find((l: { category: string }) => l.category === "groceries")?.monthly).not.toBe(123_45);
  });

  it("updates preferences and planning facts", async () => {
    const p = await call(W, "PATCH", "preferences", { lifestyleWeight: 30, protectedCategories: ["travel"], buffer: 5_000_00 });
    expect(p.body.data).toMatchObject({ lifestyleWeight: 30, protectedCategories: ["travel"], bufferMinor: 5_000_00 });
    expect((await call(W, "PUT", "facts/birth_year", { value: 1988 })).body.data.value).toEqual({ value: 1988 });
    expect((await call(W, "PUT", "facts/retirement_spending_annual", { value: 60_000_00 })).body.data.value).toEqual({ value: 60_000_00 });
    expect((await call(W, "PUT", "facts/birth_year", { value: 88 })).status).toBe(400);
    expect((await call(W, "PUT", "facts/not_a_fact", { value: 1 })).status).toBe(404);
    expect((await call(W, "PUT", "facts/home_price", { value: null })).body.data.value).toEqual({ skipped: true });
    await call(W, "DELETE", "facts/home_price");
    expect((await get(W, "me")).body.data.facts.map((f: { key: string }) => f.key)).not.toContain("home_price");
  });

  it("creates, edits and reorders goals", async () => {
    const c = await call(W, "POST", "goals", { statement: "Build an emergency fund and buy a house" });
    expect(c.status).toBe(200);
    const ids: string[] = c.body.data.ids;
    expect(ids.length).toBeGreaterThan(0);
    const e = await call(W, "PATCH", `goals/${ids[0]}`, { title: "Rainy day", target: 20_000_00, targetDate: "2028-06-01" });
    expect(e.body.data).toMatchObject({ id: ids[0], title: "Rainy day" });
    expect((await call(W, "PATCH", `goals/${ids[0]}`, { targetDate: "2028-02-30" })).status).toBe(400);
    expect((await call(W, "PUT", "goals/order", { ids: [...ids, "00000000-0000-4000-8000-000000000000"] })).status).toBe(404);
    if (ids.length > 1) {
      await call(W, "PUT", "goals/order", { ids: [...ids].reverse() });
      const stated = (await get(W, "goals")).body.data.stated as { id: string }[];
      expect(stated[0]!.id).toBe(ids.at(-1));
    }
  });

  it("adds and removes rules, notes, and recurring decisions", async () => {
    const r = await call(W, "POST", "rules", { text: "Costco is groceries" });
    expect(r.status).toBe(200);
    const [ruleId] = r.body.data.ids;
    expect((await get(W, "rules")).body.data.map((x: { id: string }) => x.id)).toContain(ruleId);
    expect((await call(W, "POST", "rules", { text: "blah blah blah" })).status).toBe(422);
    expect((await call(W, "DELETE", `rules/${ruleId}`)).status).toBe(200);
    expect((await call(W, "DELETE", `rules/${ruleId}`)).status).toBe(404);

    const n = await call(W, "POST", "context", { text: "Saving for a wedding next June" });
    expect((await get(W, "context")).body.data.memories.map((m: { id: string }) => m.id)).toContain(n.body.data.id);
    expect((await call(W, "DELETE", `context/${n.body.data.id}`)).status).toBe(200);

    const [series] = (await get(W, "recurring")).body.data;
    const ig = await call(W, "PATCH", `recurring/${series.id}`, { status: "ignored" });
    expect(ig.body.data.status).toBe("ignored");
    expect((await call(W, "PATCH", `recurring/${series.id}`, { status: "maybe" })).status).toBe(400);
  });

  it("runs and accepts a scenario", async () => {
    const s = await call(W, "POST", "scenarios", { title: "Travel more", changes: [{ type: "travel", annualDelta: 3_000_00 }] });
    expect(s.status).toBe(200);
    expect(s.body.data.id).toBeTruthy();
    expect((await call(W, "POST", "scenarios", { title: "x", changes: [{ type: "travel", annual_change: 3000 }] })).status).toBe(400);
    expect((await call(W, "POST", `scenarios/${s.body.data.id}/accept`)).body.data.applied).toContain("travel");
    expect((await call(W, "POST", `scenarios/${s.body.data.id}/accept`)).status).toBe(409);
  });

  it("manages businesses and which accounts belong to them", async () => {
    const [acct] = (await get(W, "accounts")).body.data;
    const b = await call(W, "POST", "businesses", { name: "Side gig", structure: "sole_prop", accountId: acct.id });
    expect(b.status).toBe(200);
    expect((await get(W, `accounts/${acct.id}`)).body.data.businessId).toBe(b.body.data.id);
    expect((await call(W, "PATCH", `businesses/${b.body.data.id}`, { taxSetAsidePct: 25 })).body.data.taxSetAsidePct).toBe(25);
    expect((await call(W, "PATCH", `accounts/${acct.id}`, { businessId: null })).body.data.businessId).toBeNull();
    expect((await call(W, "PATCH", `businesses/${b.body.data.id}`, {})).status).toBe(400);
    expect((await call(W, "DELETE", `businesses/${b.body.data.id}`)).status).toBe(200);
    expect((await call(W, "DELETE", `businesses/${b.body.data.id}`)).status).toBe(404);
  });

  it("never lets one user change another user's data", async () => {
    const [t] = await txns(O, "limit=1");
    const [acct] = (await get(O, "accounts")).body.data;
    const [series] = (await get(O, "recurring")).body.data;
    const before = await get(O, `transactions/${t!.id}`);
    expect((await call(W, "PATCH", `transactions/${t!.id}`, { category: "gifts" })).status).toBe(404);
    expect((await call(W, "POST", "transactions/categorize", { ids: [t!.id], category: "gifts" })).status).toBe(404);
    expect((await call(W, "PUT", `transactions/${t!.id}/splits`, { splits: [] })).status).toBe(404);
    expect((await call(W, "POST", `transactions/${t!.id}/revert`)).status).toBe(404);
    expect((await call(W, "PATCH", `accounts/${acct.id}`, { businessId: null })).status).toBe(404);
    expect((await call(W, "PATCH", `recurring/${series.id}`, { status: "ignored" })).status).toBe(404);
    expect((await get(O, `transactions/${t!.id}`)).body).toEqual(before.body);
    expect((await get(O, "recurring")).body.data[0].status).toBe(series.status);
  });

  it("explains wrong methods and bad bodies", async () => {
    const r = await call(W, "DELETE", "transactions");
    expect(r.status).toBe(405);
    expect(r.headers.get("allow")).toBe("GET");
    expect((await call(W, "GET", "goals/order")).status).toBe(405);
    expect((await call(W, "PATCH", "preferences", { lifestyleWeight: "lots" })).status).toBe(400);
    expect((await call(W, "PATCH", "preferences", [])).status).toBe(400);
    expect((await call(W, "PATCH", "transactions/not-a-uuid", { category: "gifts" })).status).toBe(404);
  });

});

describe("keeping what Plaid sends", () => {
  const P = "plaid_keep";
  let connId: string;
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    ({ db } = await testDb());
    ({ connId } = await seedHousehold(db, P));
  }, 120_000);

  it("fills in details on a redelivery without touching your corrections, and keeps the last liability", async () => {
    const { applySyncBatch } = await import("@/server/plaid/sync");
    const { ACCOUNTS, buildHousehold } = await import("./fixtures/household");
    const [first] = buildHousehold();
    const { truth: _t, ...raw } = first!;
    const [row] = await db.select().from(schema.transactions).where(eq(schema.transactions.providerId, raw.transaction_id));
    await call(P, "PATCH", `transactions/${row!.id}`, { category: "gifts", applyToMerchant: false, note: "mine" });

    // Plaid sends the same transaction again with more detail, and this time no liabilities.
    const richer = { ...raw, location: { city: "Austin", region: "TX" }, payment_meta: { reference_number: "R-1" }, check_number: null };
    await applySyncBatch(db, { id: connId, userId: P }, { accounts: ACCOUNTS, added: [], modified: [richer], removed: [], nextCursor: "c2", liabilities: null, item: { item_id: "item_x", consent_expiration_time: null, products: ["transactions", "liabilities"] } }, NOW);

    const t = (await get(P, `transactions/${row!.id}`)).body.data;
    expect(t).toMatchObject({ category: "gifts", note: "mine", userLocked: true });
    expect(t.plaid).toMatchObject({ location: { city: "Austin" }, payment_meta: { reference_number: "R-1" } });
    const mortgage = ((await get(P, "accounts")).body.data as { subtype: string; plaid: Body["data"] }[]).find((a) => a.subtype === "mortgage")!;
    expect(mortgage.plaid.liability.escrow_balance).toBe(3141.5);
    expect((await get(P, "connections")).body.data[0].plaid).toMatchObject({ item_id: "item_x", products: ["transactions", "liabilities"] });
  });

  it("keeps stored investment history when Plaid's call fails, and drops a paid-off loan's terms", async () => {
    const { applySyncBatch } = await import("@/server/plaid/sync");
    const { ACCOUNTS, LIABILITIES } = await import("./fixtures/household");
    const sync = (extra: object) => applySyncBatch(db, { id: connId, userId: P }, { accounts: ACCOUNTS, added: [], modified: [], removed: [], nextCursor: "c3", ...extra }, NOW);
    const ira = async () => ((await get(P, "accounts")).body.data as { subtype: string; plaid: Body["data"] }[]).find((a) => a.subtype === "ira")!.plaid;
    const mortgage = async () => ((await get(P, "accounts")).body.data as { subtype: string; plaid: Body["data"] }[]).find((a) => a.subtype === "mortgage")!.plaid;

    await sync({ liabilities: LIABILITIES, investments: { ira: { holdings: [{ security_id: "s1", quantity: 3 }], investmentTransactions: [{ investment_transaction_id: "it1", date: "2026-09-01", type: "buy" }] } } });
    expect((await ira()).investmentTransactions).toHaveLength(1);
    // The investment-transactions call failed this time: holdings refresh, history stays.
    await sync({ liabilities: LIABILITIES, investments: { ira: { holdings: [{ security_id: "s1", quantity: 4 }] } } });
    expect((await ira()).holdings[0].quantity).toBe(4);
    expect((await ira()).investmentTransactions).toHaveLength(1);

    // Liabilities succeeded but no longer list the mortgage: it was paid off.
    expect((await mortgage()).liability).toBeDefined();
    await sync({ liabilities: { credit: LIABILITIES.credit } });
    expect((await mortgage()).liability).toBeUndefined();
    // A failed liabilities call (null) changes nothing.
    await sync({ liabilities: LIABILITIES });
    await sync({ liabilities: null });
    expect((await mortgage()).liability.type).toBe("mortgage");
  });

  it("stores no full account numbers and survives NUL characters", async () => {
    const { applySyncBatch } = await import("@/server/plaid/sync");
    const { ACCOUNTS, LIABILITIES, buildHousehold } = await import("./fixtures/household");
    const { truth: _t, ...raw } = buildHousehold()[1]!;
    const liabilities = { ...LIABILITIES, mortgage: LIABILITIES.mortgage!.map((m) => ({ ...m, account_number: "0012345678" })) };
    const txn = { ...raw, location: { address: "12 Main\u0000 St" }, counterparties: [{ name: "Shop", account_numbers: { bacs: { account: "12345678" } } }] };
    await applySyncBatch(db, { id: connId, userId: P }, { accounts: ACCOUNTS, added: [], modified: [txn], removed: [], nextCursor: "c4", liabilities }, NOW);
    const m = ((await get(P, "accounts")).body.data as { subtype: string; plaid: Body["data"] }[]).find((a) => a.subtype === "mortgage")!.plaid.liability;
    expect(m.account_number_last4).toBe("5678");
    expect(m).not.toHaveProperty("account_number");
    const [row] = await db.select().from(schema.transactions).where(eq(schema.transactions.providerId, raw.transaction_id));
    expect((row!.plaid as Body["data"]).location.address).toBe("12 Main St");
    expect(JSON.stringify(row!.plaid)).not.toContain("12345678");
  });
});
