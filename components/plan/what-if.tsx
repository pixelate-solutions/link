"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptScenarioAction, scenarioAction } from "@/app/actions";
import { useAsk } from "@/components/ask/ask-context";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/finance/money";

export interface ScenarioView {
  id: string;
  title: string;
  assumptions: string[];
  deltas: { goalId: string; title: string; before: string; after: string; changeYears?: number | null; changeMonths?: number | null }[];
  surplus?: { before: number; after: number };
  status?: string;
}

const PRESETS: { label: string; changes: Record<string, unknown>[] }[] = [
  { label: "Spend $300 less a month", changes: [{ type: "spending", monthly_change: -300 }] },
  { label: "Invest $500 more a month", changes: [{ type: "investing", monthly_change: 500 }] },
  { label: "A child in 2 years", changes: [{ type: "child", in_years: 2 }] },
  { label: "Travel $3,000 more a year", changes: [{ type: "travel", annual_change: 3000 }] },
  { label: "Earn $1,000 more a month", changes: [{ type: "income", monthly_change: 1000 }] },
];

function delta(d: ScenarioView["deltas"][number]) {
  if (d.changeYears) {
    const m = Math.round(Math.abs(d.changeYears) * 12);
    return `${m >= 18 ? `${Math.abs(d.changeYears)} years` : `${m} months`} ${d.changeYears < 0 ? "sooner" : "later"}`;
  }
  if (d.changeMonths) return `${Math.abs(d.changeMonths)} months ${d.changeMonths < 0 ? "sooner" : "later"}`;
  return d.before === d.after ? "no change" : "";
}

/** Hypotheticals never touch the active plan until accepted. */
export function WhatIf({ initial }: { initial: ScenarioView | null }) {
  const [result, setResult] = useState<ScenarioView | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string | null>(initial?.status === "accepted" ? "Accepted." : null);
  const [pending, start] = useTransition();
  const ask = useAsk();
  const router = useRouter();

  const run = (title: string, changes: Record<string, unknown>[]) =>
    start(async () => {
      setError(null);
      setAccepted(null);
      const r = await scenarioAction(title, changes);
      if (!r.ok) return setError(r.error);
      setResult(r.data);
    });

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.label} disabled={pending} onClick={() => run(p.label, p.changes)} className="rounded-full bg-surface-2 px-3.5 py-2 text-[13px] transition-colors hover:bg-surface-3 disabled:opacity-50">
            {p.label}
          </button>
        ))}
        <button onClick={() => ask.open("What if ")} className="rounded-full px-3.5 py-2 text-[13px] text-accent-ink hover:bg-accent-soft">
          Something else…
        </button>
      </div>
      {error && <p className="mt-3 text-[13px] text-caution">{error}</p>}
      <AnimatePresence mode="wait">
        {result && (
          <motion.div key={result.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 rounded-md bg-surface-2 p-4 md:p-5">
            <p className="text-[15px] font-semibold">{result.title}</p>
            <ul className="mt-3 space-y-2">
              {result.deltas.map((d) => (
                <li key={d.goalId} className="text-[14px]">
                  <span className="text-fg-2">{d.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 tabular">
                    <span className="text-muted line-through decoration-muted/50">{d.before}</span>
                    <span className="font-medium">{d.after}</span>
                    {delta(d) && <span className="text-[12px] text-muted">{delta(d)}</span>}
                  </span>
                </li>
              ))}
              {result.surplus && (
                <li className="text-[14px]">
                  <span className="text-fg-2">Monthly surplus</span>
                  <span className="mt-0.5 flex gap-2 tabular">
                    <span className="text-muted">{formatMoney(result.surplus.before)}</span>
                    <span className="font-medium">{formatMoney(result.surplus.after)}</span>
                  </span>
                </li>
              )}
            </ul>
            <p className="mt-3 text-[12px] font-medium text-muted">Assumes</p>
            <ul className="mt-1 space-y-0.5 text-[13px] text-fg-2">
              {result.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {accepted ? (
                <span className="text-[13px] text-accent-ink">{accepted}</span>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    busy={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await acceptScenarioAction(result.id);
                        if (!r.ok) return setError(r.error);
                        setAccepted("Added to your plan.");
                        router.refresh();
                      })
                    }
                  >
                    Make this my plan
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => setResult(null)}>
                    Discard
                  </Button>
                  <span className="text-[12px] text-muted">Your plan hasn&apos;t changed.</span>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
