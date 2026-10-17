import type { InputItem, ModelAdapter, ModelTurn, ToolSpec } from "@/server/ai/provider";

/**
 * A deterministic stand-in for the model, for testing the harness itself
 * (tool loop, verification, persistence). It is not used to claim anything
 * about real model quality.
 */
export type Script = (ctx: { input: InputItem[]; tools?: ToolSpec[]; lastToolOutputs: unknown[]; round: number }) =>
  | { text: string }
  | { calls: { name: string; arguments: Record<string, unknown> }[] };

export class ScriptedModel implements ModelAdapter {
  readonly provider = "scripted";
  readonly model = "gpt-6-luna";
  calls = 0;
  requests: { input: InputItem[]; tools?: ToolSpec[] }[] = [];
  constructor(private script: Script) {}
  async respond(req: Parameters<ModelAdapter["respond"]>[0]): Promise<ModelTurn> {
    this.requests.push({ input: [...req.input], tools: req.tools });
    const lastToolOutputs = req.input
      .filter((i): i is Extract<InputItem, { type: "function_call_output" }> => "type" in i && i.type === "function_call_output")
      .map((i) => JSON.parse(i.output.replace(/^<tool_result untrusted="true">/, "").replace(/<\/tool_result>$/, "")));
    const out = this.script({ input: req.input, tools: req.tools, lastToolOutputs, round: this.calls++ });
    const usage = { input: 1200, cachedInput: 200, output: 150 };
    if ("text" in out) {
      req.onText?.(out.text);
      return { text: out.text, calls: [], carry: [], usage };
    }
    const calls = out.calls.map((c, i) => ({ callId: `call_${this.calls}_${i}`, name: c.name, arguments: JSON.stringify(c.arguments) }));
    return { text: "", calls, carry: calls.map((c) => ({ type: "function_call" as const, call_id: c.callId, name: c.name, arguments: c.arguments })), usage };
  }
}
