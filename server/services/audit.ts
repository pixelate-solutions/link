import { getDb, schema } from "../db/client";

export async function audit(userId: string, actor: "user" | "agent" | "system", action: string, target?: string | null, meta?: Record<string, unknown>) {
  const db = await getDb();
  await db.insert(schema.auditLog).values({ userId, actor, action, target: target ?? null, meta: meta ?? null });
}
