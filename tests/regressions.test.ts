import { and, eq, isNull, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { schema, type Db } from "@/server/db/client";
import { enqueue, runJobs } from "@/server/jobs";
import { applySyncBatch } from "@/server/plaid/sync";
import type { PlaidAccountLike, PlaidTxnLike } from "@/server/plaid/map";
import { pairTransfers } from "@/server/pipeline/process";
import { createUser, testDb } from "./helpers/db";

/** Regressions for findings from the adversarial review. */
let db: Db;
let conn: { id: string; userId: string };
const U = "user_reg";
const ACCTS: PlaidAccountLike[] = [
  { account_id: "chk", name: "Checking", type: "depository", subtype: "checking", balances: { current: 1000, available: 1000 } },
  { account_id: "cc", name: "Card", type: "credit", subtype: "credit card", balances: { current: 300 } },
];
const tx = (id: string, p: Partial<PlaidTxnLike> = {}): PlaidTxnLike => ({ transaction_id: id, account_id: "chk", amount: 12.5, date: "2026-10-10", name: "STORE", pending: false, iso_currency_code: "USD", ...p });
const live = async () => db.select().from(schema.transactions).where(and(eq(schema.transactions.userId, U), isNull(schema.transactions.removedAt)));
const sync = (b: Partial<Parameters<typeof applySyncBatch>[2]>) =>
  applySyncBatch(db, conn, { accounts: ACCTS, added: [], modified: [], removed: [], nextCursor: "c", ...b }, new Date("2026-10-15T12:00:00Z"));

beforeEach(async () => {
  ({ db } = await testDb());
  await createUser(db, U);
  const [c] = await db.insert(schema.connections).values({ userId: U, itemId: `item_${Math.random()}`, accessTokenEnc: "x" }).returning();
  conn = { id: c!.id, userId: U };
});

describe("sync", () => {
  it("a removal wins over an add in the same batch (fresh database)", async () => {
    await sync({ added: [tx("X", { pending: true }), tx("P", { pending_transaction_id: "X" })], removed: [{ transaction_id: "X" }] });
    expect((await live()).map((r) => r.providerId)).toEqual(["P"]);
  });

  it("a removal wins when the pending row exists and also arrives as modified", async () => {
    await sync({ added: [tx("X", { pending: true })] });
    await sync({ added: [tx("P", { pending_transaction_id: "X" })], modified: [tx("X", { pending: true, amount: 13 })], removed: [{ transaction_id: "X" }] });
    expect((await live()).map((r) => r.providerId)).toEqual(["P"]);
  });

  it("a modification on one leg of a card payment re-pairs instead of double counting", async () => {
    await sync({ added: [tx("out", { amount: 300, name: "CHASE CREDIT CRD AUTOPAY" }), tx("in", { account_id: "cc", amount: -300, name: "PAYMENT THANK YOU" })] });
    await pairTransfers(db, U, "2026-10-15");
    await sync({ modified: [tx("out", { amount: 300, name: "ONLINE PMT 8812", merchant_name: "Some Bank" })] });
    await pairTransfers(db, U, "2026-10-15");
    const rows = await live();
    expect(rows.every((r) => r.transferPairId && r.kind === "card_payment")).toBe(true);
  });
});

describe("job queue", () => {
  it("a stale running job with a queued copy doesn't wedge the queue", async () => {
    await db.insert(schema.jobs).values({ type: "refresh_all", dedupeKey: "k1", status: "running", lockedAt: new Date(Date.now() - 3_600_000), attempts: 1 });
    await enqueue({ type: "refresh_all", dedupeKey: "k1" });
    await enqueue({ type: "refresh_all", dedupeKey: "k2" });
    await runJobs({ limit: 10 });
    const jobs = await db.select().from(schema.jobs);
    const by = (k: string) => jobs.filter((j) => j.dedupeKey === k).map((j) => j.status).sort();
    expect(by("k1")).toEqual(["done", "failed"]); // stale copy retired, queued copy ran
    expect(by("k2")).toEqual(["done"]);
  });

  it("never runs two jobs with the same key at once, and retires stuck jobs out of attempts", async () => {
    await db.insert(schema.jobs).values({ type: "refresh_all", dedupeKey: "same", status: "running", lockedAt: new Date() });
    await enqueue({ type: "refresh_all", dedupeKey: "same" });
    await runJobs({ limit: 5 });
    const status = async () => (await db.select().from(schema.jobs).where(eq(schema.jobs.dedupeKey, "same"))).map((j) => j.status).sort();
    expect(await status()).toEqual(["queued", "running"]); // the copy waits for the running one
    await db.execute(sql`update link.jobs set locked_at = now() - interval '1 hour', attempts = max_attempts where status = 'running'`);
    await runJobs({ limit: 5 });
    expect(await status()).toEqual(["done", "failed"]);
  });
});
