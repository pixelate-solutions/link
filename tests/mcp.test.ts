import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildMcpServer } from "@/server/ai/mcp";
import { testDb, createUser } from "./helpers/db";
import { NOW, seedHousehold } from "./helpers/household";

async function connect(userId: string) {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await buildMcpServer(userId).connect(st);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(ct);
  return client;
}

describe("MCP server", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const { db } = await testDb();
    await seedHousehold(db, "mcp_a");
    await createUser(db, "mcp_b");
  }, 120_000);

  it("lists typed tools with read-only hints", async () => {
    const c = await connect("mcp_a");
    const { tools } = await c.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["get_financial_overview", "run_scenario", "propose_goal", "search_transactions"]));
    expect(tools.find((t) => t.name === "get_goals")!.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === "propose_goal")!.annotations?.readOnlyHint).toBe(false);
  });

  it("binds every call to the authenticated user", async () => {
    const a = await connect("mcp_a");
    const b = await connect("mcp_b");
    const ra = await a.callTool({ name: "get_financial_overview", arguments: {} });
    const rb = await b.callTool({ name: "get_financial_overview", arguments: {} });
    const pa = JSON.parse((ra.content as { text: string }[])[0]!.text);
    const pb = JSON.parse((rb.content as { text: string }[])[0]!.text);
    expect(pa.position.spendable_cash).toBeGreaterThan(0);
    expect(pb.coverage.accounts).toBe(0);
    const sb = await b.callTool({ name: "search_transactions", arguments: { limit: 50 } });
    expect(JSON.parse((sb.content as { text: string }[])[0]!.text)).toEqual([]);
  });
});
