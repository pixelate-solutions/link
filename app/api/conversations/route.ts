import { and, desc, eq } from "drizzle-orm";
import { conversationMessages } from "@/server/ai/agent";
import { requireUser } from "@/server/auth";
import { getDb, schema } from "@/server/db/client";

/** The latest conversation and its messages, for restoring the Ask panel. */
export async function GET() {
  const userId = await requireUser().catch(() => null);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const [latest] = await db.select().from(schema.conversations).where(eq(schema.conversations.userId, userId)).orderBy(desc(schema.conversations.updatedAt)).limit(1);
  if (!latest) return Response.json({ conversationId: null, messages: [] });
  const msgs = await conversationMessages(userId, latest.id);
  const pending = await db.select({ id: schema.proposals.id, summary: schema.proposals.summary, status: schema.proposals.status }).from(schema.proposals).where(and(eq(schema.proposals.userId, userId), eq(schema.proposals.conversationId, latest.id)));
  return Response.json({
    conversationId: latest.id,
    messages: msgs.slice(-30).map((m) => ({ id: m.id, role: m.role, content: m.content, parts: m.parts })),
    proposals: pending,
  });
}
