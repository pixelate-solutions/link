import { and, desc, eq } from "drizzle-orm";
import { forgetUser } from "../auth";
import { decryptSecret } from "../crypto";
import { getDb, schema } from "../db/client";
import { log } from "../log";
import { plaid, plaidConfigured, plaidErrorCode } from "../plaid/client";

export async function listConnections(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.connections.id,
      institutionName: schema.connections.institutionName,
      provider: schema.connections.provider,
      status: schema.connections.status,
      errorCode: schema.connections.errorCode,
      lastSyncedAt: schema.connections.lastSyncedAt,
      initialSyncDone: schema.connections.initialSyncDone,
      createdAt: schema.connections.createdAt,
    })
    .from(schema.connections)
    .where(eq(schema.connections.userId, userId))
    .orderBy(schema.connections.createdAt);
  return rows;
}

export async function listMemories(userId: string) {
  const db = await getDb();
  return db.select().from(schema.memories).where(eq(schema.memories.userId, userId)).orderBy(desc(schema.memories.createdAt));
}

/** Something the user wrote down for Link to keep in mind: free text, their words, never instructions. */
export async function addContext(userId: string, content: string) {
  const db = await getDb();
  const [row] = await db.insert(schema.memories).values({ userId, content, kind: "context", source: "user" }).returning({ id: schema.memories.id });
  return { id: row!.id };
}

export async function deleteMemory(userId: string, id: string) {
  const db = await getDb();
  await db.delete(schema.memories).where(and(eq(schema.memories.id, id), eq(schema.memories.userId, userId)));
}

/** Everything Link stores about the user, minus secrets. */
export async function exportUserData(userId: string) {
  const db = await getDb();
  const [user, accounts, transactions, splits, rules, corrections, recurring, goals, facts, preferences, budgets, scenarios, recommendations, conversations, messages, memories] = await Promise.all([
    db.select().from(schema.users).where(eq(schema.users.id, userId)),
    db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId)),
    db.select().from(schema.transactions).where(eq(schema.transactions.userId, userId)),
    db.select().from(schema.splits).where(eq(schema.splits.userId, userId)),
    db.select().from(schema.rules).where(eq(schema.rules.userId, userId)),
    db.select().from(schema.corrections).where(eq(schema.corrections.userId, userId)),
    db.select().from(schema.recurring).where(eq(schema.recurring.userId, userId)),
    db.select().from(schema.goals).where(eq(schema.goals.userId, userId)),
    db.select().from(schema.facts).where(eq(schema.facts.userId, userId)),
    db.select().from(schema.preferences).where(eq(schema.preferences.userId, userId)),
    db.select().from(schema.budgets).where(eq(schema.budgets.userId, userId)),
    db.select().from(schema.scenarios).where(eq(schema.scenarios.userId, userId)),
    db.select().from(schema.recommendations).where(eq(schema.recommendations.userId, userId)),
    db.select().from(schema.conversations).where(eq(schema.conversations.userId, userId)),
    db.select().from(schema.messages).where(eq(schema.messages.userId, userId)),
    db.select().from(schema.memories).where(eq(schema.memories.userId, userId)),
  ]);
  const businesses = await db.select().from(schema.businesses).where(eq(schema.businesses.userId, userId));
  const connections = (await listConnections(userId)).map((c) => ({ ...c, note: "Access tokens are never exported." }));
  return {
    exportedAt: new Date().toISOString(),
    conventions: { money: "integer minor units (cents); positive = money into your account" },
    user: user[0] ?? null,
    businesses,
    connections,
    accounts,
    transactions,
    splits,
    rules,
    corrections,
    recurring,
    goals,
    facts,
    preferences,
    budgets,
    scenarios,
    recommendations,
    conversations,
    messages,
    memories,
  };
}

/** Revoke bank access at Plaid, then delete every row belonging to the user (cascades). */
export async function deleteUserData(userId: string) {
  const db = await getDb();
  const conns = await db.select().from(schema.connections).where(eq(schema.connections.userId, userId));
  if (plaidConfigured()) {
    for (const c of conns) {
      if (c.status === "disconnected" || c.provider !== "plaid") continue;
      try {
        await plaid().itemRemove({ access_token: decryptSecret(c.accessTokenEnc, c.itemId) });
      } catch (err) {
        log.warn("delete: item/remove failed", { code: plaidErrorCode(err) });
      }
    }
  }
  await db.delete(schema.auditLog).where(eq(schema.auditLog.userId, userId));
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  forgetUser(userId);
}
