import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { conversationMessages } from "@/server/ai/agent";
import { requireUser } from "@/server/auth";
import { getDb, schema } from "@/server/db/client";
import { audit } from "@/server/services/audit";
import { attachmentsFor } from "@/server/services/attachments";

async function owned(params: Promise<{ id: string }>) {
  const userId = await requireUser().catch(() => null);
  if (!userId) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return { error: Response.json({ error: "Not found" }, { status: 404 }) } as const;
  const db = await getDb();
  const [c] = await db.select().from(schema.conversations).where(and(eq(schema.conversations.id, id.data), eq(schema.conversations.userId, userId)));
  if (!c) return { error: Response.json({ error: "Not found" }, { status: 404 }) } as const;
  return { userId, conversation: c, db } as const;
}

/** One chat: its messages, the files on each, and the state of any changes it proposed. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const o = await owned(params);
  if ("error" in o) return o.error;
  const msgs = (await conversationMessages(o.userId, o.conversation.id)).slice(-200);
  const [files, proposals] = await Promise.all([
    attachmentsFor(o.userId, msgs.map((m) => m.id)),
    o.db
      .select({ id: schema.proposals.id, summary: schema.proposals.summary, status: schema.proposals.status })
      .from(schema.proposals)
      .where(and(eq(schema.proposals.userId, o.userId), eq(schema.proposals.conversationId, o.conversation.id))),
  ]);
  return Response.json({
    conversation: { id: o.conversation.id, title: o.conversation.title },
    messages: msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      parts: m.parts,
      attachments: files.filter((f) => f.messageId === m.id).map(({ messageId: _m, ...f }) => f),
    })),
    proposals,
  });
}

/** Delete a chat and its files. Changes it proposed stay (pending ones still show on Home). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const o = await owned(params);
  if ("error" in o) return o.error;
  await o.db.delete(schema.conversations).where(and(eq(schema.conversations.id, o.conversation.id), eq(schema.conversations.userId, o.userId)));
  await audit(o.userId, "user", "conversation.delete", o.conversation.id);
  return Response.json({ ok: true });
}
