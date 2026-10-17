"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resetBudgetAction, setBudgetAction } from "@/app/actions";
import { categoryLabel } from "@/lib/finance/categories";
import { formatMoney } from "@/lib/finance/money";
import type { Picture } from "@/lib/finance/plan";
import { cn } from "@/lib/utils";

/** Optional detail: Link builds this from your history; edit only what you care about. */
export function SpendingPlan({ budget }: { budget: Picture["budget"] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = (cat: string) =>
    start(async () => {
      const n = Number(value.replace(/[$,]/g, ""));
      if (!Number.isNaN(n)) await setBudgetAction(cat, n);
      setEditing(null);
      router.refresh();
    });
  return (
    <div>
      <ul className="space-y-3.5">
        {budget.lines.map((l) => {
          const pct = l.monthly ? Math.min(1, l.spent / l.monthly) : 0;
          return (
            <li key={l.category}>
              <div className="flex items-baseline justify-between gap-3 text-[14px]">
                <span className="text-fg">
                  {categoryLabel(l.category)}
                  {l.locked && <span className="ml-1.5 text-[11px] text-muted">set by you</span>}
                </span>
                {editing === l.category ? (
                  <form onSubmit={(e) => { e.preventDefault(); save(l.category); }} className="flex items-center gap-1">
                    <span className="text-muted">$</span>
                    <input autoFocus aria-label={`${categoryLabel(l.category)} monthly amount`} value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => save(l.category)} inputMode="numeric" className="h-7 w-20 rounded-sm bg-surface-2 px-2 text-right tabular outline-none" />
                  </form>
                ) : (
                  <button onClick={() => { setEditing(l.category); setValue(String(Math.round(l.monthly / 100))); }} className="tabular text-fg-2 hover:text-fg" aria-label={`Edit ${categoryLabel(l.category)}`}>
                    <span className={cn(l.status === "over" && "text-caution")}>{formatMoney(l.spent)}</span>
                    <span className="text-muted"> / {formatMoney(l.monthly)}</span>
                  </button>
                )}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div className={cn("h-full rounded-full", l.status === "over" ? "bg-caution" : l.status === "over_pace" ? "bg-caution/70" : "bg-fg/60")} style={{ width: `${pct * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <button disabled={pending} onClick={() => start(async () => { await resetBudgetAction(); router.refresh(); })} className="mt-5 text-[13px] text-muted hover:text-fg">
        Rebuild from my recent spending
      </button>
    </div>
  );
}
