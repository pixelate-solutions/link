import { z } from "zod";
import { runAgent, type AgentEvent } from "@/server/ai/agent";
import { requireUser, UnauthorizedError } from "@/server/auth";

export const maxDuration = 60;

const Body = z.object({ message: z.string().trim().min(1).max(2000), conversationId: z.string().uuid().nullable().optional() });

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
        await runAgent({ userId, message: parsed.data.message, conversationId: parsed.data.conversationId ?? null, emit, signal: req.signal });
      } catch {
        emit({ type: "error", message: "Link couldn't finish that answer. Try again in a moment." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
