import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { decodeProtectedHeader, importJWK, type JWK, jwtVerify } from "jose";
import { getDb, schema } from "../db/client";
import { enqueue } from "../jobs";
import { log } from "../log";
import { plaid } from "./client";

/**
 * Plaid webhook verification (https://plaid.com/docs/api/webhooks/webhook-verification/):
 * ES256 JWT in `Plaid-Verification`, key fetched by `kid` and cached until it
 * expires, `iat` no older than 5 minutes, and the SHA-256 of the exact raw
 * body compared in constant time with the `request_body_sha256` claim.
 */
export type KeyFetcher = (kid: string) => Promise<JWK & { expired_at?: number | null }>;

const keyCache = new Map<string, { key: JWK; fetchedAt: number }>();

export const plaidKeyFetcher: KeyFetcher = async (kid) => {
  const { data } = await plaid().webhookVerificationKeyGet({ key_id: kid });
  return data.key as unknown as JWK & { expired_at?: number | null };
};

export async function verifyPlaidWebhook(rawBody: string, token: string | null, fetchKey: KeyFetcher = plaidKeyFetcher, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== "ES256" || !header.kid) return false;
    let cached = keyCache.get(header.kid);
    if (!cached || now - cached.fetchedAt > 24 * 3_600_000) {
      const key = await fetchKey(header.kid);
      if (key.expired_at) return false;
      cached = { key, fetchedAt: now };
      keyCache.set(header.kid, cached);
    }
    const { payload } = await jwtVerify(token, await importJWK(cached.key, "ES256"), {
      algorithms: ["ES256"],
      maxTokenAge: "5 min",
      currentDate: new Date(now),
    });
    const claimed = String((payload as { request_body_sha256?: string }).request_body_sha256 ?? "");
    const actual = createHash("sha256").update(rawBody).digest("hex");
    return claimed.length === actual.length && timingSafeEqual(Buffer.from(claimed), Buffer.from(actual));
  } catch {
    return false;
  }
}

export function clearKeyCache() {
  keyCache.clear();
}

interface PlaidWebhook {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
  error?: { error_code?: string } | null;
  initial_update_complete?: boolean;
  historical_update_complete?: boolean;
}

/** Apply a verified webhook. Duplicate deliveries are ignored. */
export async function handlePlaidWebhook(rawBody: string): Promise<{ status: "ok" | "duplicate" | "ignored" }> {
  const body = JSON.parse(rawBody) as PlaidWebhook;
  const db = await getDb();
  const eventKey = createHash("sha256").update(rawBody).digest("hex");
  const inserted = await db
    .insert(schema.webhookEvents)
    .values({ provider: "plaid", eventKey, type: `${body.webhook_type}:${body.webhook_code}`, itemId: body.item_id ?? null })
    .onConflictDoNothing()
    .returning({ id: schema.webhookEvents.id });
  if (!inserted.length) return { status: "duplicate" };
  if (!body.item_id) return { status: "ignored" };

  const [conn] = await db
    .select()
    .from(schema.connections)
    .where(and(eq(schema.connections.provider, "plaid"), eq(schema.connections.itemId, body.item_id)));
  if (!conn) {
    log.warn("webhook: unknown item", { type: body.webhook_type, code: body.webhook_code });
    return { status: "ignored" };
  }
  const now = new Date();
  const set = (patch: Partial<typeof schema.connections.$inferInsert>) =>
    db.update(schema.connections).set({ ...patch, lastWebhookAt: now, updatedAt: now }).where(and(eq(schema.connections.id, conn.id), eq(schema.connections.userId, conn.userId)));
  const sync = () => enqueue({ type: "plaid_sync", userId: conn.userId, payload: { connectionId: conn.id }, dedupeKey: `sync:${conn.id}` });

  const type = body.webhook_type;
  const code = body.webhook_code;
  if (type === "TRANSACTIONS" || type === "LIABILITIES") {
    await set({
      ...(body.initial_update_complete ? { initialSyncDone: true } : {}),
      ...(body.historical_update_complete ? { historicalSyncDone: true } : {}),
    });
    if (conn.status !== "disconnected") await sync();
    return { status: "ok" };
  }
  if (type === "ITEM") {
    switch (code) {
      case "ERROR":
        await set({ status: body.error?.error_code === "ITEM_LOGIN_REQUIRED" ? "login_required" : "error", errorCode: body.error?.error_code ?? "ITEM_ERROR" });
        break;
      case "PENDING_EXPIRATION":
      case "PENDING_DISCONNECT":
        await set({ status: "login_required", errorCode: code });
        break;
      case "USER_PERMISSION_REVOKED":
      case "USER_ACCOUNT_REVOKED":
        await set({ status: "disconnected", errorCode: code });
        break;
      case "LOGIN_REPAIRED":
        await set({ status: "active", errorCode: null });
        await sync();
        break;
      case "NEW_ACCOUNTS_AVAILABLE":
        await set({ errorCode: "NEW_ACCOUNTS_AVAILABLE" });
        break;
      default:
        await set({});
    }
    return { status: "ok" };
  }
  return { status: "ignored" };
}
