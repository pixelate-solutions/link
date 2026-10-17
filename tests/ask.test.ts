import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { schema, type Db } from "@/server/db/client";
import { runAgent, type AgentEvent } from "@/server/ai/agent";
import type { ContentPart, InputItem } from "@/server/ai/provider";
import { createProposal } from "@/server/services/proposals";
import { attachmentsFor, saveUpload } from "@/server/services/attachments";
import { createUser, testDb } from "./helpers/db";
import { NOW, seedHousehold } from "./helpers/household";
import { ScriptedModel } from "./helpers/scripted-model";

const USER = "user_ask";
let db: Db;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC", "base64");

function lastUserParts(input: InputItem[]): ContentPart[] {
  const u = [...input].reverse().find((i) => "role" in i && i.role === "user");
  return u && "content" in u && Array.isArray(u.content) ? u.content : [];
}

describe("Ask: chats, attachments and created files", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    ({ db } = await testDb());
    await seedHousehold(db, USER);
    await createUser(db, "someone_else");
  }, 120_000);

  it("shows the model the user's images and files, and only the user's own uploads", async () => {
    const img = await saveUpload(USER, { name: "receipt.png", type: "image/png", bytes: PNG });
    const csv = await saveUpload(USER, { name: "budget.csv", type: "text/csv", bytes: Buffer.from("item,amount\nrent,2050\n") });
    const theirs = await saveUpload("someone_else", { name: "x.png", type: "image/png", bytes: PNG });
    const model = new ScriptedModel(() => ({ text: "Your budget lists rent at $2,050." }));
    const r = await runAgent({ userId: USER, message: "What's in these?", attachmentIds: [img.id, csv.id, theirs.id], emit: () => {}, adapter: model });
    const parts = lastUserParts(model.requests[0]!.input);
    expect(parts.map((p) => p.type)).toEqual(["input_text", "input_image", "input_text"]);
    expect((parts[2] as { text: string }).text).toContain("rent,2050");
    // Figures read from an image can't be traced to a tool result: flagged, never rewritten away.
    expect(model.calls).toBe(1);
    expect(r.verified).toBe(false);
    const [userMsg] = await db.select().from(schema.messages).where(and(eq(schema.messages.conversationId, r.conversationId), eq(schema.messages.role, "user")));
    expect((await attachmentsFor(USER, [userMsg!.id])).map((a) => a.name).sort()).toEqual(["budget.csv", "receipt.png"]);
    const [other] = await db.select().from(schema.attachments).where(eq(schema.attachments.id, theirs.id));
    expect(other!.messageId).toBeNull();
  });

  it("counts figures from an attached text file as grounded", async () => {
    const csv = await saveUpload(USER, { name: "rent.csv", type: "text/csv", bytes: Buffer.from("item,amount\nrent,$2,050\n") });
    const model = new ScriptedModel(() => ({ text: "Rent is $2,050." }));
    const r = await runAgent({ userId: USER, message: "Rent?", attachmentIds: [csv.id], emit: () => {}, adapter: model });
    expect(r.verified).toBe(true);
    expect(model.calls).toBe(1);
  });

  it("rejects file types it can't read safely", async () => {
    await expect(saveUpload(USER, { name: "page.html", type: "text/html", bytes: Buffer.from("<script>") })).rejects.toThrow();
    await expect(saveUpload(USER, { name: "logo.svg", type: "image/svg+xml", bytes: Buffer.from("<svg/>") })).rejects.toThrow();
  });

  it("keeps files the model creates and attaches them to its reply", async () => {
    const model = new ScriptedModel(({ round }) => {
      if (round === 0) return { calls: [{ name: "create_file", arguments: { filename: "spending.csv", content: "month,total\n2026-09,4100\n" } }] };
      return { text: "Here's [your chart](sandbox:/mnt/data/chart.png) and spending.csv.", files: [{ name: "chart.png", mime: "image/png", data: PNG }], builtins: ["code_interpreter"] };
    });
    const events: AgentEvent[] = [];
    const r = await runAgent({ userId: USER, message: "Chart my spending and give me a CSV", emit: (e) => events.push(e), adapter: model });
    const files = events.filter((e): e is Extract<AgentEvent, { type: "file" }> => e.type === "file").map((e) => e.file.name);
    expect(files).toEqual(["spending.csv", "chart.png"]);
    expect(r.text).toBe("Here's your chart and spending.csv.");
    const [reply] = await db.select().from(schema.messages).where(and(eq(schema.messages.conversationId, r.conversationId), eq(schema.messages.role, "assistant")));
    expect((await attachmentsFor(USER, [reply!.id])).map((a) => a.name)).toEqual(["spending.csv", "chart.png"]);
    // The next turn knows what was created, by name.
    const next = new ScriptedModel(() => ({ text: "Sure." }));
    await runAgent({ userId: USER, message: "Thanks", conversationId: r.conversationId, emit: () => {}, adapter: next });
    const history = next.requests[0]!.input.filter((i) => "role" in i && i.role === "assistant").map((i) => ("content" in i ? String(i.content) : ""));
    expect(history.some((h) => h.includes("[Link created: spending.csv, chart.png]"))).toBe(true);
  });

  it("deleting a chat removes its messages and files but keeps changes it proposed", async () => {
    const r = await runAgent({ userId: USER, message: "hello", emit: () => {}, adapter: new ScriptedModel(() => ({ text: "Hi." })) });
    const pid = await createProposal(USER, { kind: "budget", category: "dining", monthlyMinor: 30000 }, "Dining budget $300", r.conversationId);
    await db.delete(schema.conversations).where(eq(schema.conversations.id, r.conversationId));
    expect(await db.select().from(schema.messages).where(eq(schema.messages.conversationId, r.conversationId))).toHaveLength(0);
    const [kept] = await db.select().from(schema.proposals).where(eq(schema.proposals.id, pid));
    expect(kept?.conversationId).toBeNull();
  });
});

describe("explaining a transaction in your own words", () => {
  it("turns 'moved money to my business' into an owner contribution and keeps the words as a note", async () => {
    const { explainTransactions } = await import("@/server/ai/explain");
    const { setModelAdapter } = await import("@/server/ai/provider");
    const [row] = await db.select().from(schema.transactions).where(and(eq(schema.transactions.userId, USER), eq(schema.transactions.kind, "expense"))).limit(1);
    // Without a model, the rules still read it.
    setModelAdapter({ provider: "none", model: "none", respond: async () => { throw new Error("offline"); } });
    const r = await explainTransactions(USER, [row!.id], "I moved money from my personal account to my business account");
    setModelAdapter(null);
    expect(r.category).toBe("owner_contribution");
    const [after] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, row!.id));
    expect(after!.note).toBe("I moved money from my personal account to my business account");
    expect(after!.kind).toBe("investment_transfer");
    expect(after!.needsReview).toBe(false);
  });

  it("lists categories alphabetically by the label people see", async () => {
    const { PICKABLE, pickLabel } = await import("@/components/activity/review");
    const labels = PICKABLE.map(pickLabel);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(PICKABLE).toContain("owner_draw");
  });
});
