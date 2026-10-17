import { z } from "zod";
import { runAgent, type AgentEvent } from "@/server/ai/agent";
import { requireUser, UnauthorizedError } from "@/server/auth";

// Image generation and code interpreter can run for a minute or more.
export const maxDuration = 300;

const Body = z
  .object({
    message: z.string().trim().max(4000),
    conversationId: z.string().uuid().nullable().optional(),
    attachmentIds: z.array(z.string().uuid()).max(8).optional(),
  })
  .refine((b) => b.message.length > 0 || (b.attachmentIds?.length ?? 0) > 0);

/** Streams agent events as newline-delimited JSON. */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireUser();
  } catch (err) {
    return Response.json({ error: "Unauthorized" }, { status: err instanceof UnauthorizedError ? 401 : 500 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        await runAgent({
          userId,
          message: parsed.data.message,
          conversationId: parsed.data.conversationId ?? null,
          attachmentIds: parsed.data.attachmentIds ?? [],
          emit,
          signal: req.signal,
        });
      } catch {
        emit({ type: "error", message: "Link couldn't finish that answer. Try again in a moment." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
