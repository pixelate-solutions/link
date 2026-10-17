import { and, desc, eq, max, sql } from "drizzle-orm";
import { autoBudget, type BudgetItem } from "@/lib/finance/budget";
import { type CategoryId, category as categoryDef, isCategoryId } from "@/lib/finance/categories";
import { type FactKey, FACT_KEYS, type GoalInterpretation, type GoalKind, interpretGoals } from "@/lib/finance/goals";
import type { Minor } from "@/lib/finance/money";
import { runScenario, type ScenarioChange, type ScenarioResult } from "@/lib/finance/scenario";
import { getDb, schema } from "../db/client";
import { interpretGoalsWithAI } from "../ai/interpret";
import { audit } from "./audit";
import { computeContext, refreshPicture } from "./picture";

// ── Goals ───────────────────────────────────────────────────────────────────

export async function listGoals(userId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.goals)
    .where(and(eq(schema.goals.userId, userId), eq(schema.goals.status, "active")))
    .orderBy(schema.goals.priority, schema.goals.createdAt);
}

/** Turn a sentence into one or more goals. AI refines the rules-based reading when available. */
export async function createGoalsFromStatement(userId: string, statement: string, actor: "user" | "agent" = "user") {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const interpretations = await interpretGoalsWithAI(userId, statement, today).catch(() => interpretGoals(statement, today));
  const [{ top }] = (await db
    .select({ top: max(schema.goals.priority) })
    .from(schema.goals)
    .where(and(eq(schema.goals.userId, userId), eq(schema.goals.status, "active")))) as [{ top: number | null }];
  let priority = (top ?? 0) + 1;
  const created: string[] = [];
  for (const i of interpretations) {
    const [row] = await db
      .insert(schema.goals)
      .values({
        userId,
        statement,
        kind: i.kind,
        title: i.title,
        priority: priority++,
        interpretation: i,
        targetMinor: i.target.amount ?? null,
        targetDate: i.target.date ?? null,
      })
      .returning({ id: schema.goals.id });
    created.push(row!.id);
  }
  // Qualitative preferences in the statement shape the plan, not just the goal.
  const q = interpretations[0]?.qualifiers;
  if (q?.preserveLifestyle) await setPreferences(userId, { lifestyleWeight: 70 }, actor);
  const protect = interpretations.flatMap((i) => i.protectedCategories);
  if (protect.length) await addProtectedCategories(userId, protect);
  await audit(userId, actor, "goals.create", created.join(","), { statement });
  await refreshPicture(userId);
  return { ids: created, interpretations };
}

export async function updateGoal(
  userId: string,
  id: string,
  patch: { title?: string; priority?: number; targetMinor?: Minor | null; targetDate?: string | null; status?: "active" | "achieved" | "paused" | "archived"; kind?: GoalKind },
  actor: "user" | "agent" = "user",
) {
  const db = await getDb();
  const [goal] = await db.select().from(schema.goals).where(and(eq(schema.goals.id, id), eq(schema.goals.userId, userId)));
  if (!goal) throw new Error("Goal not found");
  const interpretation = { ...(goal.interpretation as GoalInterpretation) };
  if (patch.targetMinor !== undefined) interpretation.target = { ...interpretation.target, amount: patch.targetMinor ?? undefined };
  if (patch.targetDate !== undefined) interpretation.target = { ...interpretation.target, date: patch.targetDate ?? undefined };
  if (patch.kind) interpretation.kind = patch.kind;
  await db
    .update(schema.goals)
    .set({ ...patch, interpretation, updatedAt: new Date() })
    .where(and(eq(schema.goals.id, id), eq(schema.goals.userId, userId)));
  await audit(userId, actor, "goals.update", id, patch);
  await refreshPicture(userId);
}

/** Reorder goals; `ids` is the full desired order. Ids not owned by the user are ignored. */
export async function reorderGoals(userId: string, ids: string[]) {
  const db = await getDb();
  let p = 1;
  for (const id of ids) {
    await db.update(schema.goals).set({ priority: p++ }).where(and(eq(schema.goals.id, id), eq(schema.goals.userId, userId)));
  }
  await refreshPicture(userId);
}

// ── Facts & preferences ─────────────────────────────────────────────────────

export function isFactKey(k: string): k is FactKey {
  return (FACT_KEYS as readonly string[]).includes(k);
}

export async function setFact(userId: string, key: FactKey, value: number | null, opts: { source?: "user" | "assumed"; refresh?: boolean } = {}) {
  const db = await getDb();
  const v = value == null ? { skipped: true } : { value };
  await db
    .insert(schema.facts)
    .values({ userId, key, value: v, source: opts.source ?? "user" })
    .onConflictDoUpdate({ target: [schema.facts.userId, schema.facts.key], set: { value: v, source: opts.source ?? "user", updatedAt: new Date() } });
  await audit(userId, "user", "facts.set", key);
  if (opts.refresh !== false) await refreshPicture(userId);
}

export async function deleteFact(userId: string, key: string) {
  const db = await getDb();
  await db.delete(schema.facts).where(and(eq(schema.facts.userId, userId), eq(schema.facts.key, key)));
  await refreshPicture(userId);
}

export async function listFacts(userId: string) {
  const db = await getDb();
  return db.select().from(schema.facts).where(eq(schema.facts.userId, userId));
}

export async function getPreferences(userId: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.preferences).where(eq(schema.preferences.userId, userId));
  return row ?? { userId, lifestyleWeight: 50, protectedCategories: [] as string[], bufferMinor: null, committedSavingsMinor: 0, notifyEmail: false, updatedAt: new Date() };
}

export async function setPreferences(
  userId: string,
  patch: { lifestyleWeight?: number; protectedCategories?: string[]; bufferMinor?: Minor | null; committedSavingsMinor?: Minor; notifyEmail?: boolean },
  actor: "user" | "agent" = "user",
) {
  const db = await getDb();
  const clean = {
    ...patch,
    ...(patch.lifestyleWeight != null ? { lifestyleWeight: Math.max(0, Math.min(100, Math.round(patch.lifestyleWeight))) } : {}),
    ...(patch.protectedCategories ? { protectedCategories: patch.protectedCategories.filter(isCategoryId) } : {}),
  };
  await db
    .insert(schema.preferences)
    .values({ userId, ...clean })
    .onConflictDoUpdate({ target: schema.preferences.userId, set: { ...clean, updatedAt: new Date() } });
  await audit(userId, actor, "preferences.set", null, clean);
}

async function addProtectedCategories(userId: string, cats: CategoryId[]) {
  const prefs = await getPreferences(userId);
  const merged = [...new Set([...(prefs.protectedCategories as string[]), ...cats])];
  await setPreferences(userId, { protectedCategories: merged });
}

// ── Budget ──────────────────────────────────────────────────────────────────

async function activeBudget(userId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.budgets)
    .where(and(eq(schema.budgets.userId, userId), eq(schema.budgets.status, "active")))
    .orderBy(desc(schema.budgets.version))
    .limit(1);
  return row ?? null;
}

async function saveBudget(userId: string, items: BudgetItem[], origin: "auto" | "user" | "recommendation", note?: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [{ v }] = (await tx
      .select({ v: max(schema.budgets.version) })
      .from(schema.budgets)
      .where(eq(schema.budgets.userId, userId))) as [{ v: number | null }];
    await tx.update(schema.budgets).set({ status: "superseded" }).where(and(eq(schema.budgets.userId, userId), eq(schema.budgets.status, "active")));
    await tx.insert(schema.budgets).values({ userId, version: (v ?? 0) + 1, origin, items, note: note ?? null });
  });
}

/** Set one category's monthly amount; creates a new budget version so history is kept. */
export async function setBudgetItem(userId: string, category: CategoryId, monthly: Minor, origin: "user" | "recommendation" = "user") {
  const current = await activeBudget(userId);
  let items: BudgetItem[];
  if (current) items = current.items as BudgetItem[];
  else {
    const ctx = await computeContext(userId);
    items = autoBudget(ctx.picture.baseline);
  }
  const def = categoryDef(category);
  const group = def.group === "essential" ? "essential" : "discretionary";
  const next = items.some((i) => i.category === category)
    ? items.map((i) => (i.category === category ? { ...i, monthly, locked: true } : i))
    : [...items, { category, monthly, group, locked: true } as BudgetItem];
  await saveBudget(userId, next, origin, `${def.label} → ${monthly}`);
  await audit(userId, "user", "budget.set", category, { monthly, origin });
  await refreshPicture(userId);
}

export async function resetBudget(userId: string) {
  const ctx = await computeContext(userId);
  await saveBudget(userId, autoBudget(ctx.picture.baseline), "auto", "Rebuilt from recent spending");
  await refreshPicture(userId);
}

// ── Scenarios ───────────────────────────────────────────────────────────────

export async function scenario(userId: string, title: string, changes: ScenarioChange[], save = true): Promise<ScenarioResult & { id?: string }> {
  const ctx = await computeContext(userId);
  const result = runScenario(title, ctx.inputs, ctx.data.goals, changes, {
    contributions: new Map(ctx.picture.goals.map((g) => [g.id, g.contributionMonthly])),
    reserves: new Map(ctx.picture.goals.map((g) => [g.id, g.savedAmount ?? 0])),
    connectedInvestments: ctx.picture.position.investmentsKnown,
  });
  if (!save) return result;
  const db = await getDb();
  const slim = { ...result, before: result.before.map(slimGoal), after: result.after.map(slimGoal) };
  const [row] = await db.insert(schema.scenarios).values({ userId, title, changes, result: slim }).returning({ id: schema.scenarios.id });
  return { ...result, id: row!.id };
}

function slimGoal(g: ScenarioResult["before"][number]) {
  return {
    id: g.id,
    kind: g.kind,
    title: g.title,
    status: g.status,
    headline: g.headline,
    detail: g.detail,
    progress: g.progress,
    projectedDate: g.projectedDate ?? null,
    fi: g.fi ? { scenarios: g.fi.scenarios, window: g.fi.window, monteCarlo: g.fi.monteCarlo, successAtBase: g.fi.successAtBase } : undefined,
  };
}

/**
 * Accepting a scenario turns its hypothetical changes into real plan settings
 * where that is meaningful (facts, preferences, budget). Changes that only a
 * real-world action can make true (investing more, earning more) are recorded
 * as the user's intent, never as if they already happened.
 */
export async function acceptScenario(userId: string, id: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.scenarios).where(and(eq(schema.scenarios.id, id), eq(schema.scenarios.userId, userId)));
  if (!row) throw new Error("Scenario not found");
  const applied: string[] = [];
  for (const c of row.changes as ScenarioChange[]) {
    if (c.type === "child") {
      await setFact(userId, "children_planned", c.inYears, { refresh: false });
      if (c.monthlyCost) await setFact(userId, "child_cost_monthly", c.monthlyCost, { refresh: false });
      applied.push("child");
    } else if (c.type === "retirement_spending") {
      const facts = await listFacts(userId);
      const prev = (facts.find((f) => f.key === "retirement_spending_annual")?.value as { value?: number })?.value;
      const ctx = await computeContext(userId);
      await setFact(userId, "retirement_spending_annual", Math.max(0, (prev ?? ctx.inputs.monthlySpending * 12) + c.annualDelta), { refresh: false });
      applied.push("retirement_spending");
    } else if (c.type === "travel") {
      const ctx = await computeContext(userId);
      await setFact(userId, "travel_budget_annual", Math.max(0, (ctx.inputs.facts.travelBudgetAnnual ?? ctx.inputs.travelMonthly * 12) + c.annualDelta), { refresh: false });
      await addProtectedCategories(userId, ["travel"]);
      applied.push("travel");
    } else if (c.type === "spending" && c.category) {
      const ctx = await computeContext(userId);
      const line = ctx.picture.budget.lines.find((l) => l.category === c.category);
      if (line) await setBudgetItem(userId, c.category, Math.max(0, line.monthly + c.monthlyDelta), "user");
      applied.push("budget");
    } else {
      await db.insert(schema.memories).values({ userId, content: `Intends to ${describeChange(c)}.`, kind: "preference", source: "user" });
      applied.push("intent");
    }
  }
  await db.update(schema.scenarios).set({ status: "accepted", updatedAt: new Date() }).where(and(eq(schema.scenarios.id, id), eq(schema.scenarios.userId, userId)));
  await audit(userId, "user", "scenario.accept", id, { applied });
  await refreshPicture(userId);
  return applied;
}

function describeChange(c: ScenarioChange): string {
  switch (c.type) {
    case "investing":
      return `invest ${c.monthlyDelta / 100} more per month`;
    case "spending":
      return `change monthly spending by ${c.monthlyDelta / 100}`;
    case "income":
      return `see income change by ${c.monthlyDelta / 100} per month`;
    case "one_time":
      return `${c.label} (${c.amount / 100})`;
    default:
      return c.type;
  }
}

// ── Recommendations ─────────────────────────────────────────────────────────

export async function actOnRecommendation(userId: string, id: string, action: "apply" | "done" | "dismiss", feedback?: string) {
  const db = await getDb();
  const [rec] = await db.select().from(schema.recommendations).where(and(eq(schema.recommendations.id, id), eq(schema.recommendations.userId, userId)));
  if (!rec) throw new Error("Recommendation not found");
  const now = new Date();
  if (action === "dismiss") {
    await db
      .update(schema.recommendations)
      .set({ status: "dismissed", feedback: feedback ?? null, resolvedAt: now })
      .where(and(eq(schema.recommendations.id, id), eq(schema.recommendations.userId, userId)));
    await audit(userId, "user", "recommendation.dismiss", id, { feedback });
    return { status: "dismissed" as const };
  }
  if (action === "done") {
    // Marking done records the user's statement; Link does not pretend money moved.
    await db
      .update(schema.recommendations)
      .set({ status: "done", feedback: feedback ?? null, resolvedAt: now })
      .where(and(eq(schema.recommendations.id, id), eq(schema.recommendations.userId, userId)));
    await audit(userId, "user", "recommendation.done", id);
    await refreshPicture(userId);
    return { status: "done" as const };
  }
  const a = rec.action as { type: string; category?: string; monthly?: number; changes?: ScenarioChange[] } | null;
  const result: { status: "applied"; scenarioId?: string } = { status: "applied" };
  if (a?.type === "budget" && a.category && isCategoryId(a.category) && a.monthly != null) {
    await setBudgetItem(userId, a.category, a.monthly, "recommendation");
  } else if (a?.type === "commit_savings" && a.monthly) {
    const prefs = await getPreferences(userId);
    await setPreferences(userId, { committedSavingsMinor: (prefs.committedSavingsMinor ?? 0) + a.monthly });
  } else if (a?.type === "scenario" && a.changes) {
    const s = await scenario(userId, rec.title, a.changes);
    return { status: "applied" as const, scenarioId: s.id, preview: true };
  } else {
    throw new Error("This recommendation needs an action outside Link. Mark it done once you've made the change.");
  }
  await db
    .update(schema.recommendations)
    .set({ status: "applied", resolvedAt: now })
    .where(and(eq(schema.recommendations.id, id), eq(schema.recommendations.userId, userId)));
  await audit(userId, "user", "recommendation.apply", id, { action: a?.type });
  await refreshPicture(userId);
  return result;
}

export async function goalProgressHistory(userId: string, goalId: string) {
  const db = await getDb();
  return db
    .select({ date: schema.goalProgress.date, metrics: schema.goalProgress.metrics })
    .from(schema.goalProgress)
    .where(and(eq(schema.goalProgress.userId, userId), eq(schema.goalProgress.goalId, goalId)))
    .orderBy(schema.goalProgress.date);
}

export async function countGoals(userId: string) {
  const db = await getDb();
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.goals)
    .where(and(eq(schema.goals.userId, userId), eq(schema.goals.status, "active")));
  return r?.n ?? 0;
}
