"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Picture } from "@/lib/finance/plan";
import { formatMoney } from "@/lib/finance/money";
import { AnimatedMoney } from "@/components/ui/animated-number";
import { cn, relativeTime, shortDate } from "@/lib/utils";
import { Card, Eyebrow } from "./card";

export function SafeToSpend({ picture, shortfall }: { picture: Picture; shortfall: boolean }) {
  const [open, setOpen] = useState(false);
  const s = picture.safeToSpend;
  const f = picture.forecast;

  if (s.status === "unavailable") {
    return (
      <Card>
        <Eyebrow>Safe to spend</Eyebrow>
        <p className="mt-3 text-[15px] text-fg-2">{s.limitations[0]}</p>
      </Card>
    );
  }

  return (
    <Card className={cn(shortfall && "bg-caution-soft")}>
      {shortfall && f.shortfall ? (
        <>
          <Eyebrow className="text-caution">Heads up</Eyebrow>
          <p className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-fg md:text-[26px]">
            Checking could run short by {formatMoney(f.shortfall.amount)} around {shortDate(f.shortfall.date)}.
          </p>
          <p className="mt-2 text-[14px] text-fg-2">
            Lowest point {formatMoney(f.lowest.expected)} on {shortDate(f.lowest.date)}, based on your regular bills and typical spending.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between">
            <Eyebrow>Safe to spend</Eyebrow>
            {s.status !== "ok" && (
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", s.status === "stale" ? "bg-caution-soft text-caution" : "bg-surface-2 text-muted")}>
                {s.status === "stale" ? `As of ${relativeTime(s.cashAsOf)}` : "Estimate"}
              </span>
            )}
          </div>
          <AnimatedMoney value={s.amount} className={cn("mt-2 block text-display font-semibold", s.amount < 0 && "text-caution")} />
          <p className="mt-2 text-[14px] text-muted">
            until {shortDate(s.horizonEnd)}
            {s.perDay > 0 && <> · about {formatMoney(s.perDay)} a day</>}
          </p>
        </>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-fg-2 hover:text-fg"
      >
        How it&apos;s calculated
        <motion.span animate={{ rotate: open ? 180 : 0 }}>
          <ChevronDown size={14} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <dl className="mt-3 space-y-1.5 text-[14px]">
              {s.breakdown.map((b) => (
                <div key={b.label} className="flex justify-between">
                  <dt className="text-fg-2">{b.label}</dt>
                  <dd className="tabular">{formatMoney(b.amount, { signed: b.amount > 0 && b.label !== "Spendable cash" })}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-line pt-1.5 font-medium">
                <dt>Safe to spend</dt>
                <dd className="tabular">{formatMoney(s.amount)}</dd>
              </div>
            </dl>
            {s.limitations.length > 0 && (
              <ul className="mt-3 space-y-1 text-[13px] text-muted">
                {s.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[12px] text-muted">Balances {relativeTime(s.cashAsOf)}. Predicted bills come from your history and may shift by a few days.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
