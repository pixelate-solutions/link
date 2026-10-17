"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recommendationAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/finance/money";
import type { RecView } from "@/server/services/views";
import { cn } from "@/lib/utils";

const SHOWN = 3;

function actionLabel(r: RecView): string | null {
  switch (r.action?.type) {
    case "budget":
      return "Apply to my budget";
    case "commit_savings":
      return "Set it aside";
    case "scenario":
      return "Try it in my plan";
    default:
      return null;
  }
}

/** One short headline number for the front of the card, when there is one. */
function impactChip(r: RecView): string | null {
  const g = r.impact.goal as (RecView["impact"]["goal"] & { changeYears?: number | null; changeMonths?: number | null }) | undefined;
  if (g?.changeYears) {
    const months = Math.round(Math.abs(g.changeYears) * 12);
    return `${g.title}: ${months >= 18 ? `${Math.round(Math.abs(g.changeYears) * 10) / 10} yrs` : `${months} mo`} ${g.changeYears < 0 ? "sooner" : "later"}`;
  }
  if (g?.changeMonths) return `${g.title}: ${Math.abs(g.changeMonths)} mo ${g.changeMonths < 0 ? "sooner" : "later"}`;
  if (r.impact.interestSaved) return `Saves ${formatMoney(r.impact.interestSaved)} in interest`;
  if (r.impact.annual) return `${formatMoney(Math.abs(r.impact.annual))} a year`;
  if (r.impact.monthly) return `${formatMoney(Math.abs(r.impact.monthly))} a month`;
  return null;
}

/** The back of the card: what changes if you do it, in a couple of sentences. */
function impactSentences(r: RecView): string[] {
  const out: string[] = [];
  const g = r.impact.goal;
  if (g && g.before !== g.after) out.push(`${g.title} moves from ${g.before.replace(/^Age/, "age")} to ${g.after.replace(/^Age/, "age")}.`);
  if (r.impact.interestSaved) out.push(`You'd pay about ${formatMoney(r.impact.interestSaved)} less in interest.`);
  else if (r.impact.annual) out.push(`That's about ${formatMoney(Math.abs(r.impact.annual))} a year${r.impact.monthly ? ` (${formatMoney(Math.abs(r.impact.monthly))} a month)` : ""}.`);
  else if (r.impact.monthly) out.push(`That's about ${formatMoney(Math.abs(r.impact.monthly))} a month.`);
  if (r.tradeoffs) out.push(r.tradeoffs);
  if (!out.length) out.push(r.detail);
  return out;
}

/**
 * The three most valuable things to do next, ranked. "See the impact" flips a
 * card to what changes; "Skip" moves on. Skipped items aren't gone for good:
 * Link brings an important one back later.
 */
export function NextMoves({ recs }: { recs: RecView[] }) {
  const [skipped, setSkipped] = useState<string[]>([]);
  const visible = recs.filter((r) => !skipped.includes(r.id)).slice(0, SHOWN);
  const router = useRouter();
  const [, start] = useTransition();

  const skip = (id: string) => {
    setSkipped((s) => [...s, id]);
    start(async () => {
      const r = await recommendationAction(id, "skip");
      if (!r.ok) setSkipped((s) => s.filter((x) => x !== id));
      else router.refresh();
    });
  };

  if (!recs.length) return null;
  return (
    <section aria-labelledby="moves-title">
      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <div>
          <h2 id="moves-title" className="text-[20px] font-semibold tracking-[-0.02em]">
            Your next moves
          </h2>
          <p className="text-[13px] text-muted">Ranked by how much each helps your goals.</p>
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="rounded-lg bg-surface p-6 text-[15px] text-fg-2">
          You&apos;re caught up. Link will suggest more as your money changes, and bring back anything important you skipped.
        </div>
      ) : (
        <ol className="grid gap-3 md:grid-cols-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {visible.map((r, i) => (
              <motion.li
                key={r.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                className="h-full"
              >
                <MoveCard rec={r} rank={i + 1} onSkip={() => skip(r.id)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}

function MoveCard({ rec, rank, onSkip }: { rec: RecView; rank: number; onSkip: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const label = actionLabel(rec);
  const chip = impactChip(rec);
  const lead = rank === 1;

  const apply = () =>
    start(async () => {
      setError(null);
      const r = await recommendationAction(rec.id, "apply");
      if (!r.ok) return setError(r.error);
      const data = r.data as { scenarioId?: string };
      if (data.scenarioId) return router.push(`/plan?scenario=${data.scenarioId}#what-if`);
      setDone("Done. It's part of your plan now.");
      router.refresh();
    });

  const face = cn("flex h-full flex-col rounded-lg p-5", lead ? "bg-surface ring-2 ring-accent/60" : "bg-surface");
  // A real flip: the front turns away, then the back turns in. Each face keeps its own height.
  const turn = { initial: { rotateY: -90 }, animate: { rotateY: 0 }, exit: { rotateY: 90 }, transition: { duration: 0.16, ease: "easeOut" } } as const;

  return (
    <div className="h-full [perspective:1200px]">
      <AnimatePresence mode="wait" initial={false}>
        {!flipped ? (
          <motion.article key="front" {...turn} className={face}>
            <div className="flex items-center gap-2">
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular", lead ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg-2")}>{rank}</span>
              {rec.resurfaced ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-caution-soft px-2 py-0.5 text-[11px] font-medium text-caution">
                  <RotateCcw size={11} /> Back because it matters
                </span>
              ) : (
                lead && <span className="text-[12px] font-medium text-accent-ink">Most valuable</span>
              )}
            </div>
            <h3 className="mt-3 text-[18px] font-semibold leading-snug tracking-[-0.02em]">{rec.title}</h3>
            <p className="mt-1.5 line-clamp-3 text-[14px] text-fg-2">{rec.detail}</p>
            {chip && <p className="mt-3 w-fit rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-medium text-accent-ink">{chip}</p>}
            <div className="mt-auto flex items-center gap-2 pt-5">
              <Button size="sm" variant="primary" onClick={() => setFlipped(true)}>
                See the impact
              </Button>
              <Button size="sm" variant="quiet" onClick={onSkip}>
                Skip
              </Button>
            </div>
          </motion.article>
        ) : (
          <motion.article key="back" {...turn} className={face}>
            <p className="text-[12px] font-medium text-accent-ink">The impact</p>
            <h3 className="mt-1 text-[15px] font-semibold leading-snug tracking-[-0.01em]">{rec.title}</h3>
            <div className="mt-2 space-y-1.5 text-[14px] text-fg">
              {impactSentences(rec).map((t) => (
                <p key={t}>{t}</p>
              ))}
            </div>
            {rec.evidence.length > 0 && (
              <dl className="mt-3 space-y-1 border-t border-line pt-3 text-[12px]">
                {rec.evidence.slice(0, 3).map((e) => (
                  <div key={e.label} className="flex justify-between gap-3">
                    <dt className="text-muted">{e.label}</dt>
                    <dd className="text-right tabular text-fg-2">{e.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {done && (
              <p className="mt-3 text-[13px] text-accent-ink" role="status">
                {done}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 text-[13px] text-caution">
                {error}
              </p>
            )}
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
              {label && !done && (
                <Button size="sm" variant="primary" busy={pending} onClick={apply}>
                  {label}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setFlipped(false)} aria-label="Back to the summary">
                <ArrowLeft size={14} />
              </Button>
              <Button size="sm" variant="quiet" onClick={onSkip} className="ml-auto">
                Skip
              </Button>
            </div>
          </motion.article>
        )}
      </AnimatePresence>
    </div>
  );
}
