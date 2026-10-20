import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { audit } from "./audit";

/**
 * Personal API tokens: `link_` + 32 random bytes. The token is shown once at
 * creation; only its SHA-256 hash is stored, so a database leak can't be replayed.
 * Tokens read data only — every route that accepts one is read-only.
 */
export const TOKEN_PREFIX = "link_";
const MAX_ACTIVE = 20;
/** Don't write `last_used_at` on every request; once a minute is plenty. */
const TOUCH_EVERY_MS = 60_000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createApiToken(userId: string, name: string) {
  const label = name.trim().slice(0, 60) || "API token";
  const db = await getDb();
  const active = await db
    .select({ id: schema.apiTokens.id })
    .from(schema.apiTokens)
    .where(and(eq(schema.apiTokens.userId, userId), isNull(schema.apiTokens.revokedAt)));
  if (active.length >= MAX_ACTIVE) throw new Error(`You can have up to ${MAX_ACTIVE} tokens. Revoke one first.`);
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(schema.apiTokens)
    .values({ userId, name: label, hash: hashToken(token), prefix: token.slice(0, TOKEN_PREFIX.length + 6) })
    .returning({ id: schema.apiTokens.id, name: schema.apiTokens.name, prefix: schema.apiTokens.prefix, createdAt: schema.apiTokens.createdAt });
  await audit(userId, "user", "api_token.create", row!.id);
  return { ...row!, token };
}

/** Active tokens, newest first. Never includes the hash. */
export async function listApiTokens(userId: string) {
  const db = await getDb();
  return db
    .select({ id: schema.apiTokens.id, name: schema.apiTokens.name, prefix: schema.apiTokens.prefix, lastUsedAt: schema.apiTokens.lastUsedAt, createdAt: schema.apiTokens.createdAt })
    .from(schema.apiTokens)
    .where(and(eq(schema.apiTokens.userId, userId), isNull(schema.apiTokens.revokedAt)))
    .orderBy(desc(schema.apiTokens.createdAt));
}

export async function revokeApiToken(userId: string, id: string) {
  const db = await getDb();
  const rows = await db
    .update(schema.apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.userId, userId), isNull(schema.apiTokens.revokedAt)))
    .returning({ id: schema.apiTokens.id });
  if (rows.length) await audit(userId, "user", "api_token.revoke", id);
}

/** The user a token belongs to, or null if it's unknown or revoked. */
export async function verifyApiToken(token: string, now = new Date()): Promise<string | null> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
  const db = await getDb();
  const [row] = await db
    .select({ id: schema.apiTokens.id, userId: schema.apiTokens.userId, lastUsedAt: schema.apiTokens.lastUsedAt })
    .from(schema.apiTokens)
    .where(and(eq(schema.apiTokens.hash, hashToken(token)), isNull(schema.apiTokens.revokedAt)));
  if (!row) return null;
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    await db.update(schema.apiTokens).set({ lastUsedAt: now }).where(eq(schema.apiTokens.id, row.id));
  }
  return row.userId;
}

/** The `Authorization: Bearer …` value when it is a Link token, else null. */
export function bearerToken(req: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return m && m[1]!.startsWith(TOKEN_PREFIX) ? m[1]! : null;
}
