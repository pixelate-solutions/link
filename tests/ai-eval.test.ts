import { beforeAll, describe, expect, it, vi } from "vitest";
import { EVAL_CASES, INJECTED_TXN, runEval } from "@/server/ai/eval";
import { applySyncBatch } from "@/server/plaid/sync";
import { ACCOUNTS } from "./fixtures/household";
import { createGoalsFromStatement } from "@/server/services/plan";
import { testDb } from "./helpers/db";
import { NOW, seedHousehold } from "./helpers/household";

/** The evaluation suite against Link's deterministic planner (no model key in CI). */
describe("AI evaluation suite (deterministic planner)", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const { db } = await testDb();
    const { connId } = await seedHousehold(db, "eval_user");
    await applySyncBatch(db, { id: connId, userId: "eval_user" }, { accounts: ACCOUNTS, added: [INJECTED_TXN], modified: [], removed: [], nextCursor: "inj" }, NOW);
    await createGoalsFromStatement("eval_user", "I want to retire as soon as possible without completely sacrificing my lifestyle.");
  }, 120_000);

  it("passes every case", async () => {
    const results = await runEval("eval_user", null);
    const failed = results.filter((r) => !r.passed);
    expect(failed.map((f) => `${f.id}: ${f.failures.join("; ")}\n${f.answer}`).join("\n\n")).toBe("");
    expect(results).toHaveLength(EVAL_CASES.length);
  }, 120_000);
});
