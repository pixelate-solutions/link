import { and, desc, eq } from "drizzle-orm";
import { type CategoryId, isCategoryId } from "@/lib/finance/categories";
import type { GoalKind } from "@/lib/finance/goals";
import { parseRuleText } from "@/lib/finance/rules";
import { getDb, schema } from "../db/client";
import { addRules } from "./activity";
import { audit } from "./audit";
import { refreshPicture } from "./picture";
import { createGoalsFromStatement, getPreferences, setBudgetItem, setFact, setPreferences, updateGoal } from "./plan";

/**
 * Consequential changes proposed by the agent (or an MCP client). Nothing is
 * changed until the signed-in user approves in Link.
 */
export type ProposalPayload =
  | { kind: "goal_create"; statement: string }
  | { kind: "goal_update"; goalId: string; title?: string; priority?: number; targetMinor?: number | null; targetDate?: string | null; status?: "active" | "achieved" | "paused" | "archived"; goalKind?: GoalKind }
  | { kind: "preferences"; lifestyleWeight?: number; protect?: CategoryId[]; unprotect?: CategoryId[]; travelBudgetAnnualMinor?: number }
  | { kind: "budget"; category: CategoryId; monthlyMinor: number }
  | { kind: "rule"; text: string };

export async function createProposal(userId: string, payload: ProposalPayload, summary: string, conversationId?: string | null) {
  const db = await getDb();
  // Validate early so the user never approves something that can't apply.
  if (payload.kind === "rule" && !parseRuleText(payload.text)) throw new Error("Couldn't turn that into a rule. Try: \"Costco is groceries unless it's gas\".");
  if (payload.kind === "budget" && !isCategoryId(payload.category)) throw new Error("Unknown category");
  if (payload.kind === "goal_update") {
    const [g] = await db.select({ id: schema.goals.id }).from(schema.goals).where(and(eq(schema.goals.id, payload.goalId), eq(schema.goals.userId, userId)));
    if (!g) throw new Error("Goal not found");
  }
  const [row] = await db
    .insert(schema.proposals)
    .values({ userId, conversationId: conversationId ?? null, kind: payload.kind, payload, summary })
    .returning({ id: schema.proposals.id });
  return row!.id;
}

export async function listPendingProposals(userId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.proposals)
    .where(and(eq(schema.proposals.userId, userId), eq(schema.proposals.status, "pending")))
    .orderBy(desc(schema.proposals.createdAt));
}

export async function resolveProposal(userId: string, id: string, approve: boolean) {
  const db = await getDb();
  const [p] = await db
    .select()
    .from(schema.proposals)
    .where(and(eq(schema.proposals.id, id), eq(schema.proposals.userId, userId), eq(schema.proposals.status, "pending")));
  if (!p) throw new Error("Proposal not found or already resolved");
  if (approve) {
    const payload = p.payload as ProposalPayload;
    switch (payload.kind) {
      case "goal_create":
        await createGoalsFromStatement(userId, payload.statement, "agent");
        break;
      case "goal_update": {
        const { goalId, goalKind, kind: _k, ...patch } = payload;
        await updateGoal(userId, goalId, { ...patch, ...(goalKind ? { kind: goalKind } : {}) }, "agent");
        break;
      }
      case "preferences": {
        const prefs = await getPreferences(userId);
        let protectedCats = new Set(prefs.protectedCategories as string[]);
        for (const c of payload.protect ?? []) protectedCats.add(c);
        for (const c of payload.unprotect ?? []) protectedCats.delete(c);
        if (payload.protect?.length === 0 && payload.unprotect?.length === 0) protectedCats = new Set(prefs.protectedCategories as string[]);
        await setPreferences(userId, { lifestyleWeight: payload.lifestyleWeight, protectedCategories: [...protectedCats] }, "agent");
        if (payload.travelBudgetAnnualMinor != null) await setFact(userId, "travel_budget_annual", payload.travelBudgetAnnualMinor, { refresh: false });
        await refreshPicture(userId);
        break;
      }
      case "budget":
        await setBudgetItem(userId, payload.category, payload.monthlyMinor);
        break;
      case "rule": {
        const parsed = parseRuleText(payload.text);
        if (!parsed) throw new Error("Rule no longer parses");
        await addRules(userId, parsed, "ai");
        break;
      }
    }
  }
  await db
    .update(schema.proposals)
    .set({ status: approve ? "approved" : "rejected", resolvedAt: new Date() })
    .where(and(eq(schema.proposals.id, id), eq(schema.proposals.userId, userId)));
  await audit(userId, "user", approve ? "proposal.approve" : "proposal.reject", id, { kind: p.kind });
  return { status: approve ? "approved" : "rejected" };
}
