import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { BusinessSummaryCard } from "@/components/business/business-card";
import { ConnectBank } from "@/components/connect/connect-bank";
import { CashAfterBills, ShortfallHero } from "@/components/home/cash-after-bills";
import { ContextPanel } from "@/components/home/context-panel";
import { GoalsPanel } from "@/components/home/goals-panel";
import { NextMoves } from "@/components/home/next-moves";
import { QuestionCard } from "@/components/home/question-card";
import { ComingUp } from "@/components/home/secondary";
import { SpendingHero } from "@/components/home/spending-hero";
import { EmptyHome, PendingApprovals, Syncing } from "@/components/home/states";
import { requireUser } from "@/server/auth";
import { demoEnabled } from "@/server/demo/seed";
import { plaidConfigured } from "@/server/plaid/client";
import { homeView } from "@/server/services/views";

export const metadata: Metadata = { title: "Home" };

/**
 * Home reads top to bottom: how this month is going, what to do next, where
 * you're headed, and what Link should know about you. One dark hero card is
 * the focal point; actions are the only other strong color.
 */
export default async function HomePage() {
  const userId = await requireUser();
  const v = await homeView(userId);

  if (v.mode === "empty") return <EmptyHome plaid={plaidConfigured()} demo={demoEnabled()} />;
  if (v.mode === "syncing" || !v.picture) return <Syncing />;

  const p = v.picture;
  const shortfall = v.mode === "shortfall" && p.forecast.shortfall;
  // In a shortfall, covering it is the first move.
  const recs = shortfall ? [...v.recommendations].sort((a, b) => Number(b.kind === "cash_shortfall") - Number(a.kind === "cash_shortfall")) : v.recommendations;
  const question = p.questions[0];
  const review = p.coverage.reviewCount;
  const first = v.name?.trim().split(/\s+/)[0];

  return (
    <div className="space-y-8 md:space-y-10">
      {v.needsReconnect.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-3 rounded-md bg-caution-soft px-4 py-3">
          <p className="text-[14px] text-fg">{c.institution ?? "A bank"} needs you to sign in again. Until then, its balances are out of date.</p>
          <ConnectBank connectionId={c.id} label="Reconnect" size="sm" />
        </div>
      ))}

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 px-1">
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] md:text-[32px]">{first ? `Hi, ${first}` : "Your money"}</h1>
          {review > 0 && (
            <Link href="/activity?filter=review" className="inline-flex items-center gap-1.5 rounded-full bg-caution-soft px-3.5 py-1.5 text-[13px] font-medium text-caution transition-opacity hover:opacity-80">
              <span className="h-1.5 w-1.5 rounded-full bg-caution" aria-hidden />
              {review} transaction{review === 1 ? "" : "s"} need{review === 1 ? "s" : ""} a look
              <ArrowRight size={14} />
            </Link>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-[1.6fr_1fr]">
          {shortfall ? <ShortfallHero picture={p} /> : p.budget.plannedThisMonth > 0 ? <SpendingHero picture={p} /> : <CashAfterBills picture={p} />}
          {shortfall || p.budget.plannedThisMonth > 0 ? <CashAfterBills picture={p} compact /> : <ComingUp picture={p} logos={v.logos} />}
        </div>
        <PendingApprovals items={v.proposals} />
      </div>

      <NextMoves recs={recs} />

      <div className="grid gap-4 md:grid-cols-[1.6fr_1fr]">
        <GoalsPanel goals={p.goals} />
        {p.budget.plannedThisMonth > 0 || shortfall ? <ComingUp picture={p} logos={v.logos} /> : <div className="hidden md:block" />}
      </div>

      <section aria-labelledby="understand-title" className="space-y-3">
        <div className="px-1">
          <h2 id="understand-title" className="text-[20px] font-semibold tracking-[-0.02em]">
            Help Link understand you
          </h2>
          <p className="text-[13px] text-muted">The more Link knows about your life, the better your plan fits it.</p>
        </div>
        <div className={question ? "grid gap-4 md:grid-cols-2" : ""}>
          {question && <QuestionCard q={question} />}
          <ContextPanel items={v.context} />
        </div>
      </section>

      {p.businesses.length > 0 && (
        <section className="space-y-3">
          <h2 className="px-1 text-[20px] font-semibold tracking-[-0.02em]">Your businesses</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {p.businesses.map((b) => (
              <BusinessSummaryCard key={b.id} b={b} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
