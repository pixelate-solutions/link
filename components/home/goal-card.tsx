"use client";

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { GoalView } from "@/lib/finance/plan";
import { formatMoney } from "@/lib/finance/money";
import { cn } from "@/lib/utils";
import { Card, Eyebrow } from "./card";

/** A timeline: where the projected window sits, and where the plan would move it. */
export function WindowBar({ from, to, planFrom, planTo, start, label }: { from: number; to: number; planFrom?: number | null; planTo?: number | null; start: number; label: (n: number) => string }) {
  const end = Math.ceil(Math.max(to, planTo ?? 0) + 4);
  const pct = (x: number) => `${((x - start) / (end - start)) * 100}%`;
  return (
    <div className="mt-5" aria-hidden>
      <div className="relative h-2 rounded-full bg-surface-2">
        {planFrom != null && planTo != null && (
          <motion.div
            className="absolute inset-y-0 rounded-full border border-dashed border-accent/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, left: pct(planFrom), width: `calc(${pct(planTo)} - ${pct(planFrom)})` }}
          />
        )}
        <motion.div className="absolute inset-y-0 rounded-full bg-accent" initial={false} animate={{ left: pct(from), width: `calc(${pct(to)} - ${pct(from)} + 4px)` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted tabular">
        <span>{label(start)}</span>
        <span>{label(end)}</span>
      </div>
    </div>
  );
}

export function GoalCard({ goal, compact }: { goal: GoalView; compact?: boolean }) {
  const fi = goal.fi?.window;
  const start = goal.fi && fi ? (fi.fromAge != null ? Math.floor(fi.fromAge - fi.fromYears) : 0) : 0;
  return (
    <Link href="/plan" className="group block focus-visible:outline-none">
      <Card className="h-full transition-colors group-hover:bg-surface/80 group-focus-visible:ring-2 group-focus-visible:ring-[var(--focus)]">
        <div className="flex items-start justify-between">
          <Eyebrow>{goal.title}</Eyebrow>
          <ArrowRight size={16} className="text-muted transition-transform group-hover:translate-x-0.5" />
        </div>
        <p className={cn("mt-2 font-semibold tracking-[-0.03em]", compact ? "text-[22px]" : "text-figure")}>{goal.headline}</p>
        {goal.kind === "financial_independence" && fi ? (
          <WindowBar
            from={fi.fromAge ?? fi.fromYears}
            to={fi.toAge ?? fi.toYears}
            planFrom={goal.withPlan?.fiWindow ? (goal.withPlan.fiWindow.fromAge ?? goal.withPlan.fiWindow.fromYears) : null}
            planTo={goal.withPlan?.fiWindow ? (goal.withPlan.fiWindow.toAge ?? goal.withPlan.fiWindow.toYears) : null}
            start={fi.fromAge != null ? start : 0}
            label={(n) => (fi.fromAge != null ? `${n}` : n === 0 ? "now" : `${n}y`)}
          />
        ) : goal.progress != null ? (
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-2">
            <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${Math.max(2, goal.progress * 100)}%` }} />
          </div>
        ) : null}
        <p className="mt-3 text-[14px] text-fg-2">{goal.detail}</p>
        {goal.withPlan && goal.withPlan.headline !== goal.headline && (
          <p className="mt-1.5 text-[13px] text-accent-ink">
            With your plan: {goal.withPlan.headline}
            {goal.allocationMonthly > 0 && <span className="text-muted"> · +{formatMoney(goal.allocationMonthly)}/mo</span>}
          </p>
        )}
      </Card>
    </Link>
  );
}
