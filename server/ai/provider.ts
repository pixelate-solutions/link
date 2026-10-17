import type OpenAI from "openai";

/**
 * Model provider abstraction. Link talks to OpenAI's Responses API; the model
 * id is configuration, never hard-coded at call sites. The default is GPT-6
 * Luna (`gpt-6-luna`), the model requested for Link. See docs/AI_HARNESS.md.
 */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export type InputItem =
  | { role: "user" | "assistant" | "developer"; content: string }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string }
  | { type: "opaque"; item: unknown }; // reasoning items passed back verbatim

export interface ModelTurn {
  text: string;
  calls: { callId: string; name: string; arguments: string }[];
  /** Items to append to the next request's input (function calls, reasoning). */
  carry: InputItem[];
  usage: { input: number; cachedInput: number; output: number };
}

export interface ModelAdapter {
  readonly provider: string;
  readonly model: string;
  respond(req: {
    instructions: string;
    input: InputItem[];
    tools?: ToolSpec[];
    schema?: { name: string; schema: Record<string, unknown> };
    onText?: (delta: string) => void;
    signal?: AbortSignal;
  }): Promise<ModelTurn>;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY) && process.env.LINK_AI_DISABLED !== "1";
}

export function aiModel(): string {
  return process.env.LINK_AI_MODEL || "gpt-6-luna";
}

type Effort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export function aiEffort(): Effort {
  return (process.env.LINK_AI_REASONING_EFFORT as Effort) || "low";
}

/** USD per 1M tokens: [input, cached input, output]. Used only for cost tracking. */
const PRICES: Record<string, [number, number, number]> = {
  "gpt-6-luna": [0.1, 0.01, 0.5],
  "gpt-5.6-luna": [0.2, 0.02, 1.2],
  "gpt-6-sol": [2, 0.2, 10],
  "gpt-6.1-sol": [2, 0.2, 10],
  "gpt-6-astra": [10, 1, 50],
};

export function costMicros(model: string, usage: ModelTurn["usage"]): number {
  const p = PRICES[model];
  if (!p) return 0;
  const uncached = Math.max(0, usage.input - usage.cachedInput);
  return Math.round(uncached * p[0] + usage.cachedInput * p[1] + usage.output * p[2]);
}

function toOpenAIInput(items: InputItem[]): OpenAI.Responses.ResponseInput {
  return items.map((i) => {
    if ("role" in i) return { role: i.role, content: i.content };
    if (i.type === "opaque") return i.item as OpenAI.Responses.ResponseInputItem;
    return i as OpenAI.Responses.ResponseInputItem;
  });
}

export class OpenAIResponsesAdapter implements ModelAdapter {
  readonly provider = "openai";
  constructor(
    readonly model = aiModel(),
    private effort: Effort = aiEffort(),
    private client?: OpenAI,
  ) {}

  private async api(): Promise<OpenAI> {
    if (!this.client) {
      const { default: OpenAIClient } = await import("openai");
      this.client = new OpenAIClient({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2, timeout: 60_000 });
    }
    return this.client;
  }

  async respond(req: Parameters<ModelAdapter["respond"]>[0]): Promise<ModelTurn> {
    const api = await this.api();
    const params: OpenAI.Responses.ResponseCreateParamsStreaming = {
      model: this.model,
      instructions: req.instructions,
      input: toOpenAIInput(req.input),
      reasoning: { effort: this.effort },
      // Financial data is not retained by the provider beyond the request.
      store: false,
      include: ["reasoning.encrypted_content"],
      tools: req.tools?.map((t) => ({ type: "function" as const, name: t.name, description: t.description, parameters: t.parameters, strict: false })),
      text: req.schema ? { format: { type: "json_schema", name: req.schema.name, schema: req.schema.schema, strict: true } } : undefined,
      stream: true,
    };
    const stream = await api.responses.create(params, { signal: req.signal });
    let text = "";
    let final: OpenAI.Responses.Response | null = null;
    for await (const ev of stream) {
      if (ev.type === "response.output_text.delta") {
        text += ev.delta;
        req.onText?.(ev.delta);
      } else if (ev.type === "response.completed") {
        final = ev.response;
      } else if (ev.type === "response.failed" || ev.type === "error") {
        throw new Error("Model request failed");
      }
    }
    if (!final) throw new Error("Model stream ended without a response");
    const calls: ModelTurn["calls"] = [];
    const carry: InputItem[] = [];
    for (const item of final.output) {
      if (item.type === "function_call") {
        calls.push({ callId: item.call_id, name: item.name, arguments: item.arguments });
        carry.push({ type: "function_call", call_id: item.call_id, name: item.name, arguments: item.arguments });
      } else if (item.type === "reasoning") {
        carry.push({ type: "opaque", item });
      }
    }
    const u = final.usage;
    return {
      text: text || final.output_text || "",
      calls,
      carry,
      usage: { input: u?.input_tokens ?? 0, cachedInput: u?.input_tokens_details?.cached_tokens ?? 0, output: u?.output_tokens ?? 0 },
    };
  }
}

let override: ModelAdapter | null = null;

/** Tests and evals inject a scripted adapter; production uses OpenAI when configured. */
export function setModelAdapter(adapter: ModelAdapter | null) {
  override = adapter;
}

export function modelAdapter(): ModelAdapter | null {
  if (override) return override;
  return aiConfigured() ? new OpenAIResponsesAdapter() : null;
}
