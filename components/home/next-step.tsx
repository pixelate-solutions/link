"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recommendationAction } from "@/app/actions";
import { useAsk } from "@/components/ask/ask-context";
import { Button } from "@/components/ui/button";
import type { RecView } from "@/server/services/views";
import { cn } from "@/lib/utils";
import { Card, Eyebrow } from "./card";

function applyLabel(r: RecView): string | null {
  switch (r.action?.type) {
    case "budget":
      return "Apply to budget";
    case "commit_savings":
      return "Set it aside";
    case "scenario":
      return "See the impact";
    default:
      return null;
  }
}

/** The single most valuable action, expanding in place into its evidence. */
export function NextStep({ rec, eyebrow = "Next step", compact }: { rec: RecView; eyebrow?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ask = useAsk();
  const label = applyLabel(rec);

  const act = (action: "apply" | "done" | "dismiss") =>
    start(async () => {
      setError(null);
      const r = await recommendationAction(rec.id, action);
      if (!r.ok) return setError(r.error);
      const data = r.data as { status: string; scenarioId?: string };
      if (data.scenarioId) return router.push(`/plan?scenario=${data.scenarioId}`);
      setDone(action === "dismiss" ? "Dismissed. Link won't bring this up again unless things change." : action === "done" ? "Marked done. Link will confirm it in your data." : "Applied to your plan.");
      router.refresh();
    });

  return (
    <motion.div layout>
      <Card className={cn(compact && "p-4 md:p-5")}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-2 block w-full text-left">
          <p className={cn("font-semibold tracking-[-0.02em]", compact ? "text-[17px]" : "text-[20px] leading-snug md:text-[22px]")}>{rec.title}</p>
          <p className="mt-1.5 text-[14px] text-fg-2">{rec.detail}</p>
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-4 space-y-4 border-t border-line pt-4 text-[14px]">
                {rec.evidence.length > 0 && (
                  <dl className="space-y-1">
                    {rec.evidence.map((e) => (
                      <div key={e.label} className="flex justify-between gap-4">
                        <dt className="text-fg-2">{e.label}</dt>
                        <dd className="tabular text-right">{e.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {rec.assumptions.length > 0 && (
                  <div>
                    <p className="text-[12px] font-medium text-muted">Assumes</p>
                    <ul className="mt-1 space-y-0.5 text-fg-2">
                      {rec.assumptions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {rec.tradeoffs && <p className="text-fg-2">{rec.tradeoffs}</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {done ? (
          <p className="mt-4 text-[13px] text-accent-ink">{done}</p>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {label && (
              <Button variant="primary" size="sm" busy={pending} onClick={() => act("apply")}>
                {label}
              </Button>
            )}
            <Button size="sm" onClick={() => ask.open(`Why do you recommend: "${rec.title}"?`, true)}>
              Why?
            </Button>
            <Button size="sm" variant="ghost" onClick={() => act("done")} disabled={pending}>
              Done
            </Button>
            <Button size="sm" variant="quiet" onClick={() => act("dismiss")} disabled={pending}>
              Not for me
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-[13px] text-caution">
            {error}
          </p>
        )}
      </Card>
    </motion.div>
  );
}
