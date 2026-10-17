import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/server/auth";
import { getDb, schema } from "@/server/db/client";

/** The user's chats, most recent first. */
export async function GET() {
  const userId = await requireUser().catch(() => null);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const rows = await db
    .select({ id: schema.conversations.id, title: schema.conversations.title, updatedAt: schema.conversations.updatedAt })
    .from(schema.conversations)
    .where(eq(schema.conversations.userId, userId))
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(100);
  return Response.json({ conversations: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })) });
}
