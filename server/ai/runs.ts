import { getDb, schema } from "../db/client";
import { costMicros, type ModelAdapter, type ModelTurn } from "./provider";

export async function recordRun(args: {
  userId: string;
  purpose: "chat" | "goal" | "classify";
  adapter: ModelAdapter;
  usage: ModelTurn["usage"];
  latencyMs: number;
  status: "ok" | "error";
  error?: string;
  conversationId?: string | null;
}) {
  const db = await getDb();
  const [row] = await db
    .insert(schema.agentRuns)
    .values({
      userId: args.userId,
      conversationId: args.conversationId ?? null,
      purpose: args.purpose,
      provider: args.adapter.provider,
      model: args.adapter.model,
      status: args.status,
      inputTokens: args.usage.input,
      outputTokens: args.usage.output,
      costMicros: costMicros(args.adapter.model, args.usage),
      latencyMs: args.latencyMs,
      error: args.error?.slice(0, 500) ?? null,
    })
    .returning({ id: schema.agentRuns.id });
  return row!.id;
}

export function addUsage(a: ModelTurn["usage"], b: ModelTurn["usage"]): ModelTurn["usage"] {
  return { input: a.input + b.input, cachedInput: a.cachedInput + b.cachedInput, output: a.output + b.output };
}
