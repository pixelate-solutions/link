/**
 * Import legacy Link data into the link schema.
 *   npm run db:import-legacy                 → dry run (rolled back), prints the reconciliation
 *   npm run db:import-legacy -- --apply      → writes; legacy tables are never modified
 *   ... --user <clerk_user_id>               → limit to one user
 * Take a database backup (Neon branch or pg_dump) before --apply in production.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema, type Db } from "../server/db/client";
import { importLegacy } from "../server/migration/legacy";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const userIdx = args.indexOf("--user");
const userId = userIdx >= 0 ? args[userIdx + 1] : undefined;

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client, { schema }) as unknown as Db;
const report = await importLegacy(db, { dryRun: !apply, userId });
const bad = report.reconciliation.filter((r) => !r.ok);
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...report, reconciliation: { accounts: report.reconciliation.length, mismatches: bad } }, null, 2));
await client.end();
process.exit(bad.length ? 1 : 0);
