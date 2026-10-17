"use client";

import { animate, useMotionValue, useReducedMotion, useTransform, motion } from "motion/react";
import { useEffect } from "react";
import { formatMoney } from "@/lib/finance/money";

/** Money that eases between values instead of jumping; reads correctly at rest and for screen readers. */
export function AnimatedMoney({ value, cents = false, className, signed }: { value: number; cents?: boolean; className?: string; signed?: boolean }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => formatMoney(Math.round(v), { cents, signed }));
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { type: "spring", stiffness: 140, damping: 24 });
    return () => c.stop();
  }, [value, reduce, mv]);
  return (
    <span className={className}>
      <span className="sr-only">{formatMoney(value, { cents, signed })}</span>
      <motion.span aria-hidden className="tabular">
        {text}
      </motion.span>
    </span>
  );
}
