import type { Metadata } from "next";
import { BusinessSummaryCard } from "@/components/business/business-card";
import { ConnectBank } from "@/components/connect/connect-bank";
import { GoalCard } from "@/components/home/goal-card";
import { NextStep } from "@/components/home/next-step";
import { QuestionCard } from "@/components/home/question-card";
import { SafeToSpend } from "@/components/home/safe-to-spend";
import { ComingUp, Learned, ThisMonth } from "@/components/home/secondary";
import { EmptyHome, PendingApprovals, Syncing } from "@/components/home/states";
import { requireUser } from "@/server/auth";
import { demoEnabled } from "@/server/demo/seed";
import { plaidConfigured } from "@/server/plaid/client";
import { homeView } from "@/server/services/views";

export const metadata: Metadata = { title: "Home" };

/**
 * Home answers three questions, in order: Am I okay? Am I moving toward my
 * goals? What should I do next? The lead card adapts (shortfall, new
 * connection), the structure does not.
 */
export default async function HomePage() {
  const userId = await requireUser();
  const v = await homeView(userId);

  if (v.mode === "empty") return <EmptyHome plaid={plaidConfigured()} demo={demoEnabled()} />;
  if (v.mode === "syncing" || !v.picture) return <Syncing />;

  const p = v.picture;
  const goal = p.goals[0];
  const first = v.recommendations[0];
  const lead = v.mode === "shortfall" ? v.recommendations.find((r) => r.kind === "cash_shortfall") ?? first : first;
  const others = v.recommendations.filter((r) => r.id !== lead?.id).slice(0, 2);
  const question = p.questions[0];

  return (
    <div className="space-y-3 md:space-y-4">
      {v.needsReconnect.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-3 rounded-md bg-caution-soft px-4 py-3">
          <p className="text-[14px] text-fg">{c.institution ?? "A bank"} needs you to sign in again. Until then, its balances are out of date.</p>
          <ConnectBank connectionId={c.id} label="Reconnect" size="sm" />
        </div>
      ))}

      <div className="grid gap-3 md:grid-cols-2 md:gap-4">
        <SafeToSpend picture={p} shortfall={v.mode === "shortfall"} />
        {goal ? <GoalCard goal={goal} /> : <NoGoal />}
      </div>

      {v.mode === "new" && <Learned picture={p} />}
      {lead && <NextStep rec={lead} />}
      <PendingApprovals items={v.proposals} />
      {question && <QuestionCard q={question} />}

      <div className="grid gap-3 md:grid-cols-2 md:gap-4">
        <ThisMonth picture={p} />
        <ComingUp picture={p} />
      </div>

      {p.businesses.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          {p.businesses.map((b) => (
            <BusinessSummaryCard key={b.id} b={b} />
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          {others.map((r) => (
            <NextStep key={r.id} rec={r} eyebrow="Also worth doing" compact />
          ))}
        </div>
      )}
    </div>
  );
}

function NoGoal() {
  return (
    <a href="/plan#goals" className="block rounded-lg border border-dashed border-line p-6 text-[15px] text-fg-2 hover:border-accent">
      <span className="text-[13px] font-medium text-muted">Your goal</span>
      <span className="mt-2 block text-[17px] font-medium text-fg">Tell Link what you want your money to do</span>
    </a>
  );
}
