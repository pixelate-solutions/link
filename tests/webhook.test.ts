import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { schema, type Db } from "@/server/db/client";
import { clearKeyCache, handlePlaidWebhook, verifyPlaidWebhook } from "@/server/plaid/webhook";
import { createUser, testDb } from "./helpers/db";

let db: Db;
const body = JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "item_w", initial_update_complete: true }, null, 2);

async function signed(raw: string, opts: { iat?: number; alg?: "ES256" | "HS256" } = {}) {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256" };
  const token = await new SignJWT({ request_body_sha256: createHash("sha256").update(raw).digest("hex") })
    .setProtectedHeader({ alg: "ES256", kid: "k1", typ: "JWT" })
    .setIssuedAt(opts.iat ?? Math.floor(Date.now() / 1000))
    .sign(privateKey);
  return { token, fetchKey: async () => jwk };
}

describe("Plaid webhooks", () => {
  beforeAll(async () => {
    ({ db } = await testDb());
    await createUser(db, "user_w");
    await db.insert(schema.connections).values({ userId: "user_w", itemId: "item_w", accessTokenEnc: "v1.a.b.c" });
  });

  it("accepts a valid signature over the exact body", async () => {
    clearKeyCache();
    const { token, fetchKey } = await signed(body);
    expect(await verifyPlaidWebhook(body, token, fetchKey)).toBe(true);
  });
  it("rejects tampered bodies, stale tokens, missing headers and other algorithms", async () => {
    clearKeyCache();
    const { token, fetchKey } = await signed(body);
    expect(await verifyPlaidWebhook(body.replace("item_w", "item_x"), token, fetchKey)).toBe(false);
    clearKeyCache();
    const old = await signed(body, { iat: Math.floor(Date.now() / 1000) - 600 });
    expect(await verifyPlaidWebhook(body, old.token, old.fetchKey)).toBe(false);
    expect(await verifyPlaidWebhook(body, null, fetchKey)).toBe(false);
    const hs = "eyJhbGciOiJIUzI1NiIsImtpZCI6ImsxIn0.e30.sig";
    expect(await verifyPlaidWebhook(body, hs, fetchKey)).toBe(false);
  });
  it("ignores retries of the same delivery but accepts the same notification later", async () => {
    const t = Date.parse("2026-10-17T12:00:00Z");
    expect((await handlePlaidWebhook(body, t)).status).toBe("ok");
    expect((await handlePlaidWebhook(body, t + 60_000)).status).toBe("duplicate");
    const jobs = await db.select().from(schema.jobs).where(eq(schema.jobs.type, "plaid_sync"));
    expect(jobs).toHaveLength(1);
    const [c] = await db.select().from(schema.connections).where(eq(schema.connections.itemId, "item_w"));
    expect(c!.initialSyncDone).toBe(true);
    // An hour later the identical body is a new notification; the sync job is still deduped while queued.
    expect((await handlePlaidWebhook(body, t + 3_600_000)).status).toBe("ok");
    expect(await db.select().from(schema.jobs).where(eq(schema.jobs.type, "plaid_sync"))).toHaveLength(1);
  });
  it("tracks connection health from ITEM webhooks", async () => {
    await handlePlaidWebhook(JSON.stringify({ webhook_type: "ITEM", webhook_code: "ERROR", item_id: "item_w", error: { error_code: "ITEM_LOGIN_REQUIRED" } }));
    let [c] = await db.select().from(schema.connections).where(eq(schema.connections.itemId, "item_w"));
    expect(c!.status).toBe("login_required");
    await handlePlaidWebhook(JSON.stringify({ webhook_type: "ITEM", webhook_code: "LOGIN_REPAIRED", item_id: "item_w" }));
    [c] = await db.select().from(schema.connections).where(eq(schema.connections.itemId, "item_w"));
    expect(c!.status).toBe("active");
  });
});
