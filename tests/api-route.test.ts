import { beforeAll, describe, expect, it, vi } from "vitest";
import { createApiToken, revokeApiToken } from "@/server/services/api-tokens";
import { testDb } from "./helpers/db";
import { NOW, seedHousehold } from "./helpers/household";

// A signed-in browser session for this user.
vi.mock("@/server/auth", () => ({ authMode: () => "dev", currentUserId: async () => "route_u", ensureUser: async () => {} }));
const route = await import("@/app/api/v1/[[...path]]/route");
const mcp = await import("@/app/api/mcp/route");

async function mcpTools(token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await mcp.POST(new Request("http://link.test/api/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) }));
  if (res.status !== 200) return { status: res.status, names: [] as string[] };
  const text = await res.text();
  const payload = JSON.parse(text.startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data: "))!.slice(6));
  return { status: res.status, names: (payload.result.tools as { name: string }[]).map((t) => t.name) };
}

const U = "route_u";

async function send(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, opts: { token?: string; body?: string; auth?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.auth) headers.authorization = opts.auth;
  const req = new Request(`http://link.test/api/v1/${path}`, { method, headers, body: opts.body });
  const res = await route[method](req, { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
  return { status: res.status, body: await res.json() };
}

describe("REST API v1 route auth", () => {
  let txnId: string;
  let read: string;
  let write: { id: string; token: string };
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const { db } = await testDb();
    await seedHousehold(db, U);
    read = (await createApiToken(U, "reader")).token;
    write = await createApiToken(U, "writer", "write");
    txnId = (await send("GET", "transactions?limit=1")).body.data[0].id;
  }, 120_000);

  it("lets the browser session read but never write", async () => {
    expect((await send("GET", "budget")).status).toBe(200);
    expect((await send("PATCH", `transactions/${txnId}`, { body: JSON.stringify({ category: "gifts" }) })).status).toBe(401);
    expect((await send("DELETE", "budget")).status).toBe(401);
  });

  it("separates read-only and read-and-change tokens", async () => {
    const body = JSON.stringify({ category: "gifts", applyToMerchant: false });
    expect((await send("GET", "budget", { token: read })).status).toBe(200);
    expect((await send("PATCH", `transactions/${txnId}`, { token: read, body })).status).toBe(403);
    const ok = await send("PATCH", `transactions/${txnId}`, { token: write.token, body });
    expect(ok.status).toBe(200);
    expect(ok.body.data.category).toBe("gifts");
  });

  it("treats HEAD as a read", async () => {
    expect((await route.GET(new Request("http://link.test/api/v1", { method: "HEAD" }), { params: Promise.resolve({ path: undefined }) })).status).toBe(200);
    const head = await route.GET(new Request("http://link.test/api/v1/budget", { method: "HEAD", headers: { authorization: `Bearer ${read}` } }), { params: Promise.resolve({ path: ["budget"] }) });
    expect(head.status).toBe(200);
  });

  it("refuses a read-only token before looking at the body", async () => {
    expect((await send("DELETE", "budget", { token: read, body: "{not json" })).status).toBe(403);
  });

  it("gives MCP read tools to read tokens and every tool to write tokens", async () => {
    const r = await mcpTools(read);
    expect(r.names).toContain("get_financial_overview");
    expect(r.names).not.toContain("remember");
    const w = await mcpTools(write.token);
    expect(w.names).toEqual(expect.arrayContaining(["remember", "save_fact", "propose_goal", "run_scenario"]));
    expect((await mcpTools("link_unknown")).status).toBe(401);
  });

  it("rejects bad bodies and other credentials", async () => {
    expect((await send("PATCH", `transactions/${txnId}`, { token: write.token, body: "{not json" })).status).toBe(400);
    expect((await send("PATCH", `transactions/${txnId}`, { token: write.token, body: "x".repeat(100_001) })).status).toBe(413);
    expect((await send("PATCH", `transactions/${txnId}`, { auth: "Bearer sk_live_abc", body: "{}" })).status).toBe(401);
    expect((await send("GET", "budget", { auth: "Bearer sk_live_abc" })).status).toBe(401);
  });

  it("stops a revoked write token at once", async () => {
    await revokeApiToken(U, write.id);
    expect((await send("PATCH", `transactions/${txnId}`, { token: write.token, body: JSON.stringify({ note: "x" }) })).status).toBe(401);
    expect((await mcpTools(write.token)).status).toBe(401);
  });
});
