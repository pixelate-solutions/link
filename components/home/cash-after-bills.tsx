"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { Picture } from "@/lib/finance/plan";
import { formatMoney } from "@/lib/finance/money";
import { AnimatedMoney } from "@/components/ui/animated-number";
import { cn, relativeTime, shortDate } from "@/lib/utils";
import { Card, Eyebrow } from "./card";

/**
 * Cash in checking that upcoming bills, scheduled savings and a cushion don't
 * already claim, until the next paycheck. Deliberately not called "safe to
 * spend": a large number here usually means cash that should work harder.
 */
export function CashAfterBills({ picture, compact }: { picture: Picture; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const s = picture.safeToSpend;

  if (s.status === "unavailable") {
    return (
      <Card>
        <Eyebrow>Cash after bills</Eyebrow>
        <p className="mt-3 text-[15px] text-fg-2">{s.limitations[0]}</p>
      </Card>
    );
  }

  const buffer = s.breakdown.find((b) => b.label === "Safety buffer")?.amount ?? 0;
  const large = s.amount > Math.max(5_000_00, picture.baseline.spending * 1.5);

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2">
        <Eyebrow>Cash after bills</Eyebrow>
        {s.status !== "ok" && (
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", s.status === "stale" ? "bg-caution-soft text-caution" : "bg-surface-2 text-muted")}>
            {s.status === "stale" ? `As of ${relativeTime(s.cashAsOf)}` : "Estimate"}
          </span>
        )}
      </div>
      <AnimatedMoney value={s.amount} className={cn("mt-2 block font-semibold leading-none tracking-[-0.04em]", compact ? "text-[32px]" : "text-[40px]", s.amount < 0 && "text-caution")} />
      <p className="mt-3 text-[14px] text-fg-2">
        {s.amount < 0
          ? `Bills before ${shortDate(s.horizonEnd)} add up to more than you have in checking.`
          : `In checking after every bill, scheduled savings and a ${formatMoney(Math.abs(buffer))} cushion, through ${shortDate(s.horizonEnd)}.`}
      </p>
      {large && s.amount > 0 && <p className="mt-2 text-[13px] text-muted">That&apos;s more than everyday spending needs. It isn&apos;t a spending target; your next moves suggest where it could do more.</p>}

      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-auto inline-flex items-center gap-1 pt-4 text-[13px] font-medium text-fg-2 hover:text-fg">
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
                <div key={b.label} className="flex justify-between gap-3">
                  <dt className="text-fg-2">{b.label}</dt>
                  <dd className="tabular">{formatMoney(b.amount, { signed: b.amount > 0 && b.label !== "Spendable cash" })}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-line pt-1.5 font-medium">
                <dt>Cash after bills</dt>
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

/** Replaces the lead card when checking is forecast to run short soon. */
export function ShortfallHero({ picture }: { picture: Picture }) {
  const f = picture.forecast;
  if (!f.shortfall) return null;
  return (
    <section className="flex h-full flex-col rounded-lg bg-caution-soft p-6 md:p-7">
      <Eyebrow className="text-caution">Heads up</Eyebrow>
      <p className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg md:text-[30px]">
        Checking could run short by {formatMoney(f.shortfall.amount)} around {shortDate(f.shortfall.date)}.
      </p>
      <p className="mt-2 text-[15px] text-fg-2">
        Lowest point {formatMoney(f.lowest.expected)} on {shortDate(f.lowest.date)}, based on your regular bills and typical spending. Your first next move below is how to cover it.
      </p>
    </section>
  );
}
