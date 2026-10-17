/**
 * End-to-end check against the real Plaid sandbox: create an item, exchange the
 * token through Link's own code, sync until transactions arrive, process, and
 * print what Link learned. Needs PLAID_ENV=sandbox credentials and DATABASE_URL.
 *   npx tsx scripts/plaid-sandbox-check.ts
 */
import { eq } from "drizzle-orm";
import { Products } from "plaid";
import { getDb, schema } from "../server/db/client";
import { plaid, plaidEnv } from "../server/plaid/client";
import { disconnect, exchangePublicToken, syncConnection } from "../server/plaid/sync";
import { processUser } from "../server/pipeline/process";
import { formatMoney } from "../lib/finance/money";

if (plaidEnv() !== "sandbox") throw new Error("Refusing to run outside the Plaid sandbox");
const db = await getDb();
const userId = `sandbox_check_${Date.now().toString(36)}`;
await db.insert(schema.users).values({ id: userId, name: "Sandbox check", timezone: "America/New_York" });

const { data: pt } = await plaid().sandboxPublicTokenCreate({
  institution_id: "ins_109508",
  initial_products: [Products.Transactions, Products.Liabilities],
  options: { override_username: "user_transactions_dynamic", override_password: "pass_good" },
});
const connectionId = await exchangePublicToken(userId, pt.public_token, { id: "ins_109508", name: "First Platypus Bank (sandbox)" });
console.log("exchanged; connection", connectionId);

let total = 0;
for (let i = 0; i < 20 && total === 0; i++) {
  const r = await syncConnection(connectionId, userId);
  total += r.added;
  console.log(`sync ${i + 1}:`, r);
  if (!total) await new Promise((res) => setTimeout(res, 4000));
}
const picture = await processUser(userId);
const accounts = await db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId));
const [conn] = await db.select().from(schema.connections).where(eq(schema.connections.id, connectionId));
console.log({
  connectionStatus: conn?.status,
  tokenEncrypted: conn?.accessTokenEnc.startsWith("v1.") && !conn.accessTokenEnc.includes("access-"),
  accounts: accounts.map((a) => `${a.name} (${a.type}/${a.subtype}) ${a.currentMinor == null ? "—" : formatMoney(a.currentMinor)}${a.aprBps != null ? ` APR ${a.aprBps / 100}%` : ""}`),
  transactions: picture.coverage.transactions,
  needsReview: picture.coverage.reviewCount,
  recurring: picture.recurring.slice(0, 6).map((r) => `${r.merchant} ${r.kind} ${r.cadence} ${formatMoney(r.amount)}`),
  incomeMonthly: formatMoney(picture.baseline.income),
  spendingMonthly: formatMoney(picture.baseline.spending),
  safeToSpend: `${picture.safeToSpend.status} ${formatMoney(picture.safeToSpend.amount)}`,
});
if (process.env.KEEP === "1") {
  console.log("kept user", userId);
  process.exit(0);
}
await disconnect(userId, connectionId, true);
const [after] = await db.select().from(schema.connections).where(eq(schema.connections.id, connectionId));
console.log("disconnected via item/remove; connection row deleted:", !after);
await db.delete(schema.users).where(eq(schema.users.id, userId));
process.exit(0);
