"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { CATEGORIES, type CategoryId } from "@/lib/finance/categories";
import { FACT_KEYS, GOAL_KINDS, type FactKey } from "@/lib/finance/goals";
import { toMinor } from "@/lib/finance/money";
import { authMode, DEV_COOKIE, requireUser, UnauthorizedError } from "@/server/auth";
import { publicError } from "@/server/errors";
import { log } from "@/server/log";
import { toScenarioChange } from "@/server/ai/tools";
import { getDb, schema } from "@/server/db/client";
import { seedDemo } from "@/server/demo/seed";
import { enqueue, runJobs } from "@/server/jobs";
import { disconnect } from "@/server/plaid/sync";
import { addRuleFromText, correctTransaction, settleReview, deleteRule, getTransaction, revertCorrection, searchTransactions, setRecurringStatus, splitTransaction, type TxnFilters } from "@/server/services/activity";
import { addContext, deleteMemory, deleteUserData } from "@/server/services/account";
import { refreshPicture } from "@/server/services/picture";
import {
  acceptScenario,
  actOnRecommendation,
  createGoalsFromStatement,
  deleteFact,
  reorderGoals,
  resetBudget,
  scenario,
  setBudgetItem,
  setFact,
  setPreferences,
  updateGoal,
} from "@/server/services/plan";
import { resolveProposal } from "@/server/services/proposals";
import { and, eq } from "drizzle-orm";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: (userId: string) => Promise<T>, revalidate = true): Promise<ActionResult<T>> {
  try {
    const userId = await requireUser();
    const data = await fn(userId);
    if (revalidate) revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { ok: false, error: "Your session ended. Sign in again." };
    if (err instanceof z.ZodError) return { ok: false, error: "That doesn't look right. Check the value and try again." };
    const message = publicError(err);
    // Anything we replaced with a generic message is unexpected: keep the real cause in the logs.
    if (err instanceof Error && message !== err.message) log.error("action failed", err);
    return { ok: false, error: message };
  }
}

const category = z.enum(CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]]);
const uuid = z.string().uuid();
const dollars = z.number().finite();
const MONEY_FACTS: FactKey[] = ["retirement_spending_annual", "outside_investments", "workplace_contribution_monthly", "social_security_annual", "home_price", "travel_budget_annual", "child_cost_monthly"];

// ── Goals & facts ────────────────────────────────────────────────────────────

export async function createGoalsAction(statement: string) {
  return run(async (u) => {
    const text = z.string().trim().min(2).max(500).parse(statement);
    const r = await createGoalsFromStatement(u, text);
    return r.interpretations.map((i) => ({ title: i.title, kind: i.kind, summary: i.summary }));
  });
}

export async function answerFactAction(key: string, value: number | null) {
  return run(async (u) => {
    const k = z.enum(FACT_KEYS).parse(key);
    const v = value == null ? null : z.number().finite().min(0).parse(value);
    if (k === "birth_year" && v != null && (v < 1920 || v > new Date().getFullYear() - 14)) throw new Error("Enter a four-digit birth year.");
    await setFact(u, k, v == null ? null : MONEY_FACTS.includes(k) ? toMinor(v) : v);
  });
}

export async function deleteFactAction(key: string) {
  return run((u) => deleteFact(u, z.enum(FACT_KEYS).parse(key)));
}

export async function updateGoalAction(id: string, patch: { title?: string; targetDollars?: number | null; targetDate?: string | null; status?: "active" | "achieved" | "paused" | "archived"; kind?: string }) {
  return run(async (u) => {
    const p = z
      .object({
        title: z.string().trim().min(1).max(40).optional(),
        targetDollars: dollars.min(0).nullable().optional(),
        targetDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .refine((d) => !Number.isNaN(Date.parse(d)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "Invalid date")
          .nullable()
          .optional(),
        status: z.enum(["active", "achieved", "paused", "archived"]).optional(),
        kind: z.enum(GOAL_KINDS).optional(),
      })
      .parse(patch);
    await updateGoal(u, uuid.parse(id), {
      title: p.title,
      status: p.status,
      kind: p.kind,
      targetDate: p.targetDate,
      ...(p.targetDollars !== undefined ? { targetMinor: p.targetDollars == null ? null : toMinor(p.targetDollars) } : {}),
    });
  });
}

export async function reorderGoalsAction(ids: string[]) {
  return run((u) => reorderGoals(u, z.array(uuid).max(20).parse(ids)));
}

// ── Preferences, budget, scenarios ──────────────────────────────────────────

export async function setPreferencesAction(patch: { lifestyleWeight?: number; protectedCategories?: string[]; bufferDollars?: number | null }) {
  return run(async (u) => {
    const p = z.object({ lifestyleWeight: z.number().min(0).max(100).optional(), protectedCategories: z.array(category).optional(), bufferDollars: dollars.min(0).nullable().optional() }).parse(patch);
    await setPreferences(u, {
      lifestyleWeight: p.lifestyleWeight,
      protectedCategories: p.protectedCategories,
      ...(p.bufferDollars !== undefined ? { bufferMinor: p.bufferDollars == null ? null : toMinor(p.bufferDollars) } : {}),
    });
    await refreshPicture(u);
  });
}

export async function setBudgetAction(cat: string, monthlyDollars: number) {
  return run((u) => setBudgetItem(u, category.parse(cat), toMinor(dollars.min(0).parse(monthlyDollars))));
}

export async function resetBudgetAction() {
  return run((u) => resetBudget(u));
}

const changeInput = z.array(z.record(z.string(), z.unknown())).min(1).max(5);

export async function scenarioAction(title: string, changes: Record<string, unknown>[]) {
  return run(async (u) => {
    const { TOOLS } = await import("@/server/ai/tools");
    const tool = TOOLS.find((t) => t.name === "run_scenario")!;
    const parsed = tool.input.parse({ title: z.string().max(60).parse(title), changes: changeInput.parse(changes) }) as { title: string; changes: Parameters<typeof toScenarioChange>[0][] };
    const r = await scenario(u, parsed.title, parsed.changes.map(toScenarioChange));
    return {
      id: r.id!,
      title: r.title,
      assumptions: r.assumptions,
      deltas: r.deltas,
      surplus: { before: r.monthlySurplusBefore, after: r.monthlySurplusAfter },
    };
  }, false);
}

export async function acceptScenarioAction(id: string) {
  return run((u) => acceptScenario(u, uuid.parse(id)));
}

// ── Recommendations & proposals ─────────────────────────────────────────────

export async function recommendationAction(id: string, action: "apply" | "done" | "dismiss" | "skip", feedback?: string) {
  return run(async (u) => {
    const r = await actOnRecommendation(u, uuid.parse(id), z.enum(["apply", "done", "dismiss", "skip"]).parse(action), feedback ? z.string().max(200).parse(feedback) : undefined);
    return r;
  });
}

export async function proposalAction(id: string, approve: boolean) {
  return run((u) => resolveProposal(u, uuid.parse(id), Boolean(approve)));
}

// ── Activity ────────────────────────────────────────────────────────────────

const filtersSchema = z.object({
  query: z.string().max(80).optional(),
  scope: z.union([z.literal("personal"), z.string().uuid()]).optional(),
  category: z.string().max(40).optional(),
  kind: z.string().max(40).optional(),
  accountId: z.string().uuid().optional(),
  review: z.boolean().optional(),
  recurring: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  before: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), id: z.string().uuid() }).optional(),
});

export async function searchAction(filters: TxnFilters) {
  return run((u) => searchTransactions(u, filtersSchema.parse(filters)), false);
}

export async function transactionAction(id: string) {
  return run(async (u) => {
    const t = await getTransaction(u, uuid.parse(id));
    if (!t) throw new Error("Transaction not found");
    const { accessTokenEnc: _never, ...safe } = t as typeof t & { accessTokenEnc?: string };
    return safe;
  }, false);
}

export async function correctAction(id: string, cat: string, applyToMerchant: boolean) {
  return run((u) => correctTransaction(u, uuid.parse(id), { category: category.parse(cat), applyToMerchant: Boolean(applyToMerchant) }));
}

export async function settleReviewAction(ids: string[], cat: string | null) {
  return run((u) => settleReview(u, z.array(uuid).min(1).max(100).parse(ids), cat == null ? null : category.parse(cat)));
}

export async function noteAction(id: string, note: string) {
  return run(async (u) => {
    const db = await getDb();
    await db
      .update(schema.transactions)
      .set({ note: z.string().max(280).parse(note) || null, updatedAt: new Date() })
      .where(and(eq(schema.transactions.id, uuid.parse(id)), eq(schema.transactions.userId, u)));
  });
}

export async function revertAction(id: string) {
  return run((u) => revertCorrection(u, uuid.parse(id)));
}

export async function splitAction(id: string, parts: { dollars: number; category: string }[]) {
  return run(async (u) => {
    const p = z.array(z.object({ dollars: dollars, category })).max(8).parse(parts);
    await splitTransaction(u, uuid.parse(id), p.map((x) => ({ amount: toMinor(x.dollars), category: x.category })));
  });
}

export async function addRuleAction(text: string) {
  return run(async (u) => {
    const r = await addRuleFromText(u, z.string().trim().min(3).max(200).parse(text));
    if (!r) throw new Error('Try a sentence like "Costco is groceries unless it\'s gas".');
    return { rules: r.parsed.map((p) => p.description), changed: r.changed };
  });
}

export async function deleteRuleAction(id: string) {
  return run((u) => deleteRule(u, uuid.parse(id)));
}

export async function recurringAction(key: string, status: "active" | "ignored") {
  return run((u) => setRecurringStatus(u, z.string().max(300).parse(key), z.enum(["active", "ignored"]).parse(status)));
}

// ── Account ─────────────────────────────────────────────────────────────────

export async function syncNowAction() {
  return run(async (u) => {
    const db = await getDb();
    const conns = await db.select().from(schema.connections).where(and(eq(schema.connections.userId, u), eq(schema.connections.provider, "plaid")));
    for (const c of conns) await enqueue({ type: "plaid_sync", userId: u, payload: { connectionId: c.id }, dedupeKey: `sync:${c.id}` });
    await runJobs({ limit: 5, timeBudgetMs: 20_000 });
    await refreshPicture(u);
  });
}

export async function disconnectAction(connectionId: string, deleteData: boolean) {
  return run((u) => disconnect(u, uuid.parse(connectionId), Boolean(deleteData)));
}

export async function addContextAction(text: string) {
  return run((u) => addContext(u, z.string().trim().min(3).max(500).parse(text)));
}

export async function deleteMemoryAction(id: string) {
  return run((u) => deleteMemory(u, uuid.parse(id)));
}

export async function finishOnboardingAction() {
  return run(async (u) => {
    const db = await getDb();
    await db.update(schema.users).set({ onboardedAt: new Date() }).where(eq(schema.users.id, u));
  });
}

export async function loadDemoAction() {
  return run(async (u) => {
    await seedDemo(u);
  });
}

export async function deleteAccountAction(confirm: string) {
  return run(async (u) => {
    if (confirm !== "DELETE") throw new Error('Type DELETE to confirm.');
    await deleteUserData(u);
    if (authMode() === "clerk") {
      const { clerkClient } = await import("@clerk/nextjs/server");
      await (await clerkClient()).users.deleteUser(u);
    } else {
      (await cookies()).delete(DEV_COOKIE);
    }
  });
}

export async function accountOverviewAction() {
  return run(async (u) => {
    const db = await getDb();
    const { listConnections, listMemories } = await import("@/server/services/account");
    const { listRules, listAccounts } = await import("@/server/services/activity");
    const { getPreferences, listFacts } = await import("@/server/services/plan");
    const { plaidConfigured } = await import("@/server/plaid/client");
    const { demoEnabled } = await import("@/server/demo/seed");
    const [[user], connections, accounts, memories, rules, prefs, facts] = await Promise.all([
      db.select().from(schema.users).where(eq(schema.users.id, u)),
      listConnections(u),
      listAccounts(u),
      listMemories(u),
      listRules(u),
      getPreferences(u),
      listFacts(u),
    ]);
    return {
      user: { name: user?.name ?? null, email: user?.email ?? null },
      authMode: authMode(),
      plaidConfigured: plaidConfigured(),
      demoAvailable: demoEnabled(),
      connections: connections.map((c) => ({ ...c, lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null, createdAt: c.createdAt.toISOString() })),
      accounts: accounts.map((a) => ({ ...a, lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null })),
      memories: memories.map((m) => ({ id: m.id, content: m.content, kind: m.kind })),
      businesses: (await (await import("@/server/services/business")).listBusinesses(u)).map((b) => ({
        id: b.id,
        name: b.name,
        structure: b.structure,
        ownershipPct: b.ownershipPct,
        countTowardGoals: b.countTowardGoals,
        taxSetAsidePct: b.taxSetAsidePct,
      })),
      rules: rules.map((r) => ({ id: r.id, description: r.description })),
      prefs: { lifestyleWeight: prefs.lifestyleWeight, protectedCategories: prefs.protectedCategories as string[], bufferMinor: prefs.bufferMinor },
      facts: facts.map((f) => ({ key: f.key, value: f.value as { value?: number; skipped?: boolean }, source: f.source })),
    };
  }, false);
}

/** Runs this user's due background jobs (first sync, processing) while they wait on screen. */
export async function pumpJobsAction() {
  return run(async (u) => {
    const r = await runJobs({ userId: u, limit: 3, timeBudgetMs: 25_000 });
    return { processed: r.processed };
  });
}

// ── Businesses ──────────────────────────────────────────────────────────────

const structure = z.enum(["sole_prop", "llc", "s_corp", "partnership", "other"]);

export async function createBusinessAction(name: string, struct: string, accountId?: string) {
  return run(async (u) => {
    const { createBusiness, setAccountBusiness } = await import("@/server/services/business");
    const b = await createBusiness(u, { name: z.string().trim().min(1).max(60).parse(name), structure: structure.parse(struct) });
    if (accountId) await setAccountBusiness(u, uuid.parse(accountId), b.id);
    return { id: b.id };
  });
}

export async function updateBusinessAction(id: string, patch: { name?: string; structure?: string; ownershipPct?: number; countTowardGoals?: boolean; taxSetAsidePct?: number }) {
  return run(async (u) => {
    const { updateBusiness } = await import("@/server/services/business");
    const p = z
      .object({
        name: z.string().trim().min(1).max(60).optional(),
        structure: structure.optional(),
        ownershipPct: z.number().int().min(1).max(100).optional(),
        countTowardGoals: z.boolean().optional(),
        taxSetAsidePct: z.number().int().min(0).max(60).optional(),
      })
      .parse(patch);
    await updateBusiness(u, uuid.parse(id), p);
  });
}

export async function deleteBusinessAction(id: string) {
  return run(async (u) => {
    const { deleteBusiness } = await import("@/server/services/business");
    await deleteBusiness(u, uuid.parse(id));
  });
}

export async function setAccountBusinessAction(accountId: string, businessId: string | null) {
  return run(async (u) => {
    const { setAccountBusiness } = await import("@/server/services/business");
    await setAccountBusiness(u, uuid.parse(accountId), businessId == null ? null : uuid.parse(businessId));
  });
}
