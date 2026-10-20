import { and, desc, eq } from "drizzle-orm";
import { type CategoryId, isCategoryId } from "@/lib/finance/categories";
import { type FactKey, FACT_QUESTIONS, type GoalKind } from "@/lib/finance/goals";
import { formatMoney } from "@/lib/finance/money";
import { categoryLabel } from "@/lib/finance/categories";
import { parseRuleText } from "@/lib/finance/rules";
import { getDb, schema } from "../db/client";
import { addRules } from "./activity";
import { audit } from "./audit";
import { refreshPicture } from "./picture";
import { createGoalsFromStatement, getPreferences, setBudgetItem, setFact, setPreferences, updateGoal } from "./plan";
import { UserFacingError } from "../errors";

/**
 * Consequential changes proposed by the agent (or an MCP client). Nothing is
 * changed until the signed-in user approves in Link.
 */
export type ProposalPayload =
  | { kind: "goal_create"; statement: string }
  | { kind: "goal_update"; goalId: string; title?: string; priority?: number; targetMinor?: number | null; targetDate?: string | null; status?: "active" | "achieved" | "paused" | "archived"; goalKind?: GoalKind }
  | { kind: "preferences"; lifestyleWeight?: number; protect?: CategoryId[]; unprotect?: CategoryId[]; travelBudgetAnnualMinor?: number }
  | { kind: "budget"; category: CategoryId; monthlyMinor: number }
  | { kind: "rule"; text: string }
  | { kind: "fact"; key: FactKey; value: number | null };

const MONEY_FACTS = new Set<FactKey>(["retirement_spending_annual", "outside_investments", "workplace_contribution_monthly", "social_security_annual", "home_price", "travel_budget_annual", "child_cost_monthly"]);

/**
 * What the user approves is generated from the payload itself, never from
 * model-written text, so the card always says exactly what will change.
 */
export async function describeProposal(userId: string, p: ProposalPayload): Promise<string> {
  switch (p.kind) {
    case "goal_create":
      return `Add a goal: “${p.statement.slice(0, 120)}”`;
    case "goal_update": {
      const db = await getDb();
      const [g] = await db.select({ title: schema.goals.title }).from(schema.goals).where(and(eq(schema.goals.id, p.goalId), eq(schema.goals.userId, userId)));
      const t = g?.title ?? "goal";
      if (p.status === "archived") return `Remove the goal “${t}”`;
      const parts = [
        p.title && `rename to “${p.title}”`,
        p.priority != null && `make it priority ${p.priority}`,
        p.targetMinor != null && `target ${formatMoney(p.targetMinor)}`,
        p.targetDate && `by ${p.targetDate}`,
        p.status && p.status !== "active" && `mark ${p.status}`,
      ].filter(Boolean);
      return `Update “${t}”: ${parts.join(", ") || "no changes"}`;
    }
    case "preferences": {
      const parts = [
        p.lifestyleWeight != null && `Balance set to ${Math.round(p.lifestyleWeight)}/100 (${p.lifestyleWeight >= 50 ? "protect today's lifestyle" : "reach goals sooner"})`,
        p.protect?.length && `never suggest cutting ${p.protect.map(categoryLabel).join(", ")}`,
        p.unprotect?.length && `allow suggestions on ${p.unprotect.map(categoryLabel).join(", ")}`,
        p.travelBudgetAnnualMinor != null && `travel budget ${formatMoney(p.travelBudgetAnnualMinor)} a year`,
      ].filter(Boolean) as string[];
      return parts.length ? parts.map((x, i) => (i ? x : x[0]!.toUpperCase() + x.slice(1))).join("; ") : "No changes";
    }
    case "budget":
      return `Set ${categoryLabel(p.category)} to ${formatMoney(p.monthlyMinor)} a month`;
    case "rule":
      return `Add rule: ${(parseRuleText(p.text) ?? []).map((r) => r.description).join("; ") || p.text}`;
    case "fact":
      return p.value == null ? `Record that you'd rather not say: ${FACT_QUESTIONS[p.key]}` : `Save: ${FACT_QUESTIONS[p.key].replace(/\?$/, "")} → ${MONEY_FACTS.has(p.key) ? formatMoney(p.value) : p.value}`;
  }
}

export async function createProposal(userId: string, payload: ProposalPayload, _modelSummary: string, conversationId?: string | null) {
  const db = await getDb();
  // Validate early so the user never approves something that can't apply.
  if (payload.kind === "rule" && !parseRuleText(payload.text)) throw new UserFacingError("Couldn't turn that into a rule. Try: \"Costco is groceries unless it's gas\".");
  if (payload.kind === "budget" && !isCategoryId(payload.category)) throw new UserFacingError("Unknown category");
  if (payload.kind === "goal_update") {
    const [g] = await db.select({ id: schema.goals.id }).from(schema.goals).where(and(eq(schema.goals.id, payload.goalId), eq(schema.goals.userId, userId)));
    if (!g) throw new UserFacingError("Goal not found");
  }
  const [row] = await db
    .insert(schema.proposals)
    .values({ userId, conversationId: conversationId ?? null, kind: payload.kind, payload, summary: await describeProposal(userId, payload) })
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
  // Claim atomically so a double tap or concurrent request can't apply it twice.
  const [p] = await db
    .update(schema.proposals)
    .set({ status: "applying" })
    .where(and(eq(schema.proposals.id, id), eq(schema.proposals.userId, userId), eq(schema.proposals.status, "pending")))
    .returning();
  if (!p) throw new UserFacingError("Proposal not found or already resolved");
  try {
  if (approve) {
    const payload = p.payload as ProposalPayload;
    switch (payload.kind) {
      case "goal_create":
        await createGoalsFromStatement(userId, payload.statement, "agent", { applyPreferences: false });
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
        if (!parsed) throw new UserFacingError("Rule no longer parses");
        await addRules(userId, parsed, "ai");
        break;
      }
      case "fact":
        await setFact(userId, payload.key, payload.value);
        break;
    }
  }
  } catch (err) {
    await db.update(schema.proposals).set({ status: "pending" }).where(and(eq(schema.proposals.id, id), eq(schema.proposals.userId, userId)));
    throw err;
  }
  await db
    .update(schema.proposals)
    .set({ status: approve ? "approved" : "rejected", resolvedAt: new Date() })
    .where(and(eq(schema.proposals.id, id), eq(schema.proposals.userId, userId)));
  await audit(userId, "user", approve ? "proposal.approve" : "proposal.reject", id, { kind: p.kind });
  return { status: approve ? "approved" : "rejected" };
}
