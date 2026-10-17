/**
 * Run the evaluation suite against the configured model (OPENAI_API_KEY,
 * LINK_AI_MODEL) on the synthetic household in an in-process database.
 *   npm run ai:eval            → model if configured, otherwise the deterministic planner
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import { schema, setDb, type Db } from "../server/db/client";
import { INJECTED_TXN, runEval } from "../server/ai/eval";
import { modelAdapter, aiModel } from "../server/ai/provider";
import { applySyncBatch } from "../server/plaid/sync";
import { processUser } from "../server/pipeline/process";
import { ACCOUNTS, buildHousehold, LIABILITIES } from "../server/demo/household";
import { attachDemoBusiness } from "../server/demo/business";
import { createGoalsFromStatement } from "../server/services/plan";

process.env.LINK_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
const client = new PGlite();
const db = drizzle(client, { schema }) as unknown as Db;
await migrate(drizzle(client), { migrationsFolder: path.join(import.meta.dirname, "../server/db/migrations"), migrationsSchema: "link" });
setDb(db);
await db.insert(schema.users).values({ id: "eval", timezone: "UTC" });
const [conn] = await db.insert(schema.connections).values({ userId: "eval", itemId: "eval", provider: "demo", accessTokenEnc: "x" }).returning();
await applySyncBatch(db, { id: conn!.id, userId: "eval" }, { accounts: ACCOUNTS, added: [...buildHousehold().map(({ truth: _t, ...t }) => t), INJECTED_TXN], modified: [], removed: [], nextCursor: "e", liabilities: LIABILITIES });
await attachDemoBusiness({ id: conn!.id, userId: "eval" });
await processUser("eval");
await createGoalsFromStatement("eval", "I want to retire as soon as possible without completely sacrificing my lifestyle.");
const adapter = modelAdapter();
console.log(`Evaluating ${adapter ? `model ${aiModel()}` : "deterministic planner (no OPENAI_API_KEY)"}\n`);
const results = await runEval("eval", adapter);
const verbose = process.argv.includes("--verbose");
for (const r of results) {
  console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.id.padEnd(18)} tools=${r.tools.join(",") || "-"}  ${r.failures.join("; ")}`);
  if (verbose || !r.passed) console.log(`      ${r.answer.replace(/\n/g, "\n      ")}\n`);
}
console.log(`\n${results.filter((r) => r.passed).length}/${results.length} passed`);
process.exit(results.every((r) => r.passed) ? 0 : 1);
