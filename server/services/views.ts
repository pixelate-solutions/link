import { and, desc, eq } from "drizzle-orm";
import type { Picture } from "@/lib/finance/plan";
import { daysBetween } from "@/lib/finance/dates";
import { getDb, schema } from "../db/client";
import { RESURFACED } from "@/lib/finance/recommend";
import { listConnections } from "./account";
import { merchantLogos } from "./activity";
import { activeRecommendations, getPicture } from "./picture";
import { listPendingProposals } from "./proposals";

export type RecView = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  action: { type: string } | null;
  impact: { monthly?: number; annual?: number; interestSaved?: number; goal?: { title: string; before: string; after: string } };
  evidence: { label: string; value: string }[];
  assumptions: string[];
  tradeoffs: string | null;
  confidence: number;
  /** Skipped earlier and brought back because it still matters. */
  resurfaced: boolean;
};

export function toRecView(r: Awaited<ReturnType<typeof activeRecommendations>>[number]): RecView {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    detail: r.detail,
    action: (r.action as RecView["action"]) ?? null,
    impact: r.impact as RecView["impact"],
    evidence: r.evidence as RecView["evidence"],
    assumptions: r.assumptions as string[],
    tradeoffs: r.tradeoffs,
    confidence: r.confidence,
    resurfaced: r.feedback === RESURFACED,
  };
}

export type HomeMode = "empty" | "syncing" | "shortfall" | "new" | "steady";

export interface HomeView {
  mode: HomeMode;
  name: string | null;
  picture: Picture | null;
  recommendations: RecView[];
  proposals: { id: string; summary: string }[];
  needsReconnect: { id: string; institution: string | null }[];
  demo: boolean;
  /** Things the user wrote down for Link to keep in mind, newest first. */
  context: { id: string; content: string }[];
  /** Merchant name (lowercased) → logo, for upcoming bills. */
  logos: Record<string, string>;
}

/** Decide what Home leads with. Deterministic: same data, same layout. */
export function homeMode(p: Picture | null, connections: { createdAt: Date; initialSyncDone: boolean; provider: string }[]): HomeMode {
  if (!connections.length || !p || p.coverage.accounts === 0) return connections.length ? "syncing" : "empty";
  if (p.coverage.transactions === 0) return "syncing";
  if (p.forecast.shortfall && daysBetween(p.asOf, p.forecast.shortfall.date) <= 14) return "shortfall";
  const newest = Math.max(...connections.map((c) => c.createdAt.getTime()));
  if (Date.now() - newest < 3 * 86_400_000) return "new";
  return "steady";
}

export async function homeView(userId: string): Promise<HomeView> {
  const db = await getDb();
  const [connections, [user]] = await Promise.all([listConnections(userId), db.select().from(schema.users).where(eq(schema.users.id, userId))]);
  const picture = connections.length ? await getPicture(userId) : null;
  const [recs, proposals, context, logos] = await Promise.all([
    activeRecommendations(userId),
    listPendingProposals(userId),
    db
      .select({ id: schema.memories.id, content: schema.memories.content })
      .from(schema.memories)
      .where(and(eq(schema.memories.userId, userId), eq(schema.memories.kind, "context")))
      .orderBy(desc(schema.memories.createdAt))
      .limit(20),
    connections.length ? merchantLogos(userId) : Promise.resolve({}),
  ]);
  return {
    mode: homeMode(picture, connections),
    name: user?.name ?? null,
    picture,
    // Three are shown; the rest step in as the user skips.
    recommendations: recs.slice(0, 8).map(toRecView),
    proposals: proposals.slice(0, 3).map((p) => ({ id: p.id, summary: p.summary })),
    needsReconnect: connections.filter((c) => c.status === "login_required").map((c) => ({ id: c.id, institution: c.institutionName })),
    demo: connections.some((c) => c.provider === "demo"),
    context,
    logos,
  };
}

export async function latestScenario(userId: string, id: string | null) {
  if (!id) return null;
  const db = await getDb();
  const [row] = await db.select().from(schema.scenarios).where(and(eq(schema.scenarios.id, id), eq(schema.scenarios.userId, userId)));
  return row ? { id: row.id, title: row.title, status: row.status, result: row.result as Record<string, unknown> } : null;
}

export async function recentScenarios(userId: string) {
  const db = await getDb();
  const rows = await db.select().from(schema.scenarios).where(eq(schema.scenarios.userId, userId)).orderBy(desc(schema.scenarios.createdAt)).limit(5);
  return rows.map((r) => ({ id: r.id, title: r.title, status: r.status }));
}
