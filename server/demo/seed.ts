import { eq } from "drizzle-orm";
import { addDays, daysBetween, todayISO } from "@/lib/finance/dates";
import { encryptSecret } from "../crypto";
import { getDb, schema } from "../db/client";
import { applySyncBatch } from "../plaid/sync";
import { processUser } from "../pipeline/process";
import { ACCOUNTS, AS_OF, buildHousehold, LIABILITIES } from "./household";

export function demoEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.LINK_DEV_AUTH === "1";
}

/**
 * Development only: load the synthetic household through the real sync
 * applier and pipeline, shifted so its last day is today. The connection is
 * labeled `demo` everywhere in the UI and is never synced against Plaid.
 */
export async function seedDemo(userId: string, timezone = "UTC") {
  if (!demoEnabled()) throw new Error("Demo data is only available in local development");
  const db = await getDb();
  const today = todayISO(timezone);
  const shift = daysBetween(AS_OF, today);
  const [conn] = await db
    .insert(schema.connections)
    .values({ userId, provider: "demo", itemId: `demo_${userId}`, institutionName: "Demo Bank (synthetic data)", accessTokenEnc: encryptSecret("demo", `demo_${userId}`) })
    .onConflictDoNothing()
    .returning();
  if (!conn) return;
  const txns = buildHousehold().map(({ truth: _t, ...t }) => ({ ...t, date: addDays(t.date, shift), authorized_date: t.authorized_date ? addDays(t.authorized_date, shift) : null }));
  const shiftLiab = {
    ...LIABILITIES,
    credit: LIABILITIES.credit?.map((c) => ({ ...c, next_payment_due_date: c.next_payment_due_date ? addDays(c.next_payment_due_date, shift) : null })),
    mortgage: LIABILITIES.mortgage?.map((m) => ({ ...m, next_payment_due_date: m.next_payment_due_date ? addDays(m.next_payment_due_date, shift) : null })),
  };
  await applySyncBatch(db, { id: conn.id, userId }, { accounts: ACCOUNTS, added: txns, modified: [], removed: [], nextCursor: "demo", liabilities: shiftLiab });
  const { BUSINESS_ACCOUNTS, buildBusiness } = await import("./business");
  const bizTxns = buildBusiness().map(({ truth: _t, ...t }) => ({ ...t, date: addDays(t.date, shift) }));
  await applySyncBatch(db, { id: conn.id, userId }, { accounts: [...ACCOUNTS, ...BUSINESS_ACCOUNTS], added: bizTxns, modified: [], removed: [], nextCursor: "demo" });
  const { createBusiness, setAccountBusiness } = await import("../services/business");
  const b = await createBusiness(userId, { name: "Rivera Studio LLC (demo)", structure: "llc" });
  const accts = await db.select({ id: schema.accounts.id, p: schema.accounts.providerAccountId }).from(schema.accounts).where(eq(schema.accounts.connectionId, conn.id));
  for (const a of accts) if (a.p === "bizchk" || a.p === "bizcc") await setAccountBusiness(userId, a.id, b.id);
  await processUser(userId);
}
