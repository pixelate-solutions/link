import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { schema, type Db } from "@/server/db/client";
import { runTool } from "@/server/ai/tools";
import { correctTransaction, deleteRule, getTransaction, revertCorrection, searchTransactions, setRecurringStatus, splitTransaction } from "@/server/services/activity";
import { activeRecommendations, computeContext } from "@/server/services/picture";
import { acceptScenario, actOnRecommendation, createGoalsFromStatement, reorderGoals, scenario, updateGoal } from "@/server/services/plan";
import { createProposal, resolveProposal } from "@/server/services/proposals";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { redact } from "@/server/log";
import { createUser, testDb } from "./helpers/db";
import { NOW, seedHousehold } from "./helpers/household";

const A = "user_a";
const B = "user_b";
let db: Db;
let aTxn: string;
let aGoal: string;

describe("user isolation (Scenario H)", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    ({ db } = await testDb());
    await seedHousehold(db, A);
    await createUser(db, B);
    aGoal = (await createGoalsFromStatement(A, "I want to retire early")).ids[0]!;
    aTxn = (await searchTransactions(A, { limit: 1 })).rows[0]!.id;
  }, 120_000);

  it("services never return or modify another user's records by id", async () => {
    expect(await getTransaction(B, aTxn)).toBeNull();
    await expect(correctTransaction(B, aTxn, { category: "travel" })).rejects.toThrow();
    await expect(splitTransaction(B, aTxn, [])).rejects.toThrow();
    expect(await revertCorrection(B, aTxn)).toBe(false);
    await expect(updateGoal(B, aGoal, { status: "archived" })).rejects.toThrow();
    await reorderGoals(B, [aGoal]);
    const [g] = await db.select().from(schema.goals).where(eq(schema.goals.id, aGoal));
    expect([g!.status, g!.priority]).toEqual(["active", 1]);
    const [rec] = await activeRecommendations(A);
    await expect(actOnRecommendation(B, rec!.id, "dismiss")).rejects.toThrow();
    const s = await scenario(A, "x", [{ type: "investing", monthlyDelta: 10000 }]);
    await expect(acceptScenario(B, s.id!)).rejects.toThrow();
    const pid = await createProposal(A, { kind: "budget", category: "dining", monthlyMinor: 1 }, "x");
    await expect(resolveProposal(B, pid, true)).rejects.toThrow();
    const [t] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, aTxn));
    expect(t!.userLocked).toBe(false);
  });

  it("list endpoints and aggregates are scoped", async () => {
    expect((await searchTransactions(B, { limit: 200 })).rows).toEqual([]);
    const { picture } = await computeContext(B);
    expect(picture.coverage.transactions).toBe(0);
    expect(await activeRecommendations(B)).toEqual([]);
  });

  it("tools ignore user ids smuggled in arguments and refuse other users' ids", async () => {
    const r = await runTool({ userId: B, channel: "agent" }, "explain_transaction", { id: aTxn, userId: A });
    expect(r.ok).toBe(false);
    const s = await runTool({ userId: B, channel: "mcp" }, "search_transactions", { limit: 50, user_id: A });
    expect(s.result).toEqual([]);
    const p = await runTool({ userId: B, channel: "agent" }, "propose_goal", { action: "archive", goal_id: aGoal, summary: "x" });
    expect(JSON.stringify(p.result)).toMatch(/not found/i);
  });

  it("rule and recurring changes are scoped", async () => {
    const [rule] = await db.insert(schema.rules).values({ userId: A, description: "x", when: { merchant: "costco" }, then: { category: "groceries" } }).returning();
    await deleteRule(B, rule!.id);
    const [still] = await db.select().from(schema.rules).where(eq(schema.rules.id, rule!.id));
    expect(still!.active).toBe(true);
    const [series] = await db.select().from(schema.recurring).where(eq(schema.recurring.userId, A)).limit(1);
    await setRecurringStatus(B, series!.key, "ignored");
    const [s2] = await db.select().from(schema.recurring).where(and(eq(schema.recurring.id, series!.id)));
    expect(s2!.status).not.toBe("ignored");
  });

  it("access tokens are encrypted at rest, bound to their item, and redacted from logs and tool output", async () => {
    const env = encryptSecret("access-sandbox-1234-secret", "item_1");
    expect(env).not.toMatch(/access-sandbox/);
    expect(decryptSecret(env, "item_1")).toBe("access-sandbox-1234-secret");
    expect(() => decryptSecret(env, "item_2")).toThrow();
    expect(JSON.stringify(redact({ msg: "token access-sandbox-1234-secret", accessToken: "x" }))).not.toMatch(/access-sandbox|"x"/);
    const r = await runTool({ userId: A, channel: "mcp" }, "get_financial_overview", {});
    expect(JSON.stringify(r.result)).not.toMatch(/access-|v1\./);
  });
});
