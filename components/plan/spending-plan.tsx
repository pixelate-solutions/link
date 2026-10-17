"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resetBudgetAction, setBudgetAction } from "@/app/actions";
import { categoryLabel } from "@/lib/finance/categories";
import { daysInMonth } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import type { Picture } from "@/lib/finance/plan";
import { cn } from "@/lib/utils";

type Line = Picture["budget"]["lines"][number];

/**
 * The monthly budget, built from what you actually spend in each category.
 * Edit any amount; Link never changes one you've set. Home's "left to spend"
 * comes from here.
 */
export function SpendingPlan({ budget, asOf }: { budget: Picture["budget"]; asOf: string }) {
  const planned = budget.plannedThisMonth;
  const spent = Math.max(0, budget.spentThisMonth);
  const left = planned - spent;
  const month = new Date(`${asOf}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const daysLeft = daysInMonth(asOf) - Number(asOf.slice(8, 10)) + 1;
  const groups = [
    { title: "Essentials", lines: budget.lines.filter((l) => l.group === "essential") },
    { title: "Flexible", lines: budget.lines.filter((l) => l.group !== "essential") },
  ].filter((g) => g.lines.length);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{month} spending plan</h2>
          <p className="mt-1 text-[14px] text-muted">Built from what you usually spend. Tap an amount to change it.</p>
        </div>
        <div className="text-right">
          <p className={cn("text-[24px] font-semibold tracking-[-0.03em] tabular", left < 0 && "text-caution")}>
            {formatMoney(Math.abs(left))} {left < 0 ? "over" : "left"}
          </p>
          <p className="text-[13px] text-muted tabular">
            {formatMoney(spent)} of {formatMoney(planned)} · {daysLeft} days to go
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="mb-3 flex justify-between text-[12px] font-medium text-muted">
              <h3>{g.title}</h3>
              <span className="tabular">
                {formatMoney(g.lines.reduce((s, l) => s + l.spent, 0))} / {formatMoney(g.lines.reduce((s, l) => s + l.monthly, 0))}
              </span>
            </div>
            <ul className="space-y-4">
              {g.lines.map((l) => (
                <BudgetRow key={l.category} line={l} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      <RebuildButton />
    </div>
  );
}

function BudgetRow({ line: l }: { line: Line }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const pct = l.monthly ? Math.min(1, l.spent / l.monthly) : 0;
  const pace = l.monthly ? Math.min(1, l.expectedByNow / l.monthly) : 0;
  const flexible = l.group === "discretionary";
  const save = () =>
    start(async () => {
      const n = Number(value.replace(/[$,]/g, ""));
      if (!Number.isNaN(n) && Math.round(n * 100) !== l.monthly) await setBudgetAction(l.category, n);
      setEditing(false);
      router.refresh();
    });
  return (
    <li className={cn(pending && "opacity-60")}>
      <div className="flex items-baseline justify-between gap-3 text-[14px]">
        <span className="text-fg">
          {categoryLabel(l.category)}
          {l.locked && <span className="ml-1.5 text-[11px] text-muted">set by you</span>}
        </span>
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="flex items-center gap-1"
          >
            <span className="text-muted">$</span>
            <input autoFocus aria-label={`${categoryLabel(l.category)} monthly amount`} value={value} onChange={(e) => setValue(e.target.value)} onBlur={save} inputMode="numeric" className="h-7 w-20 rounded-sm bg-surface-2 px-2 text-right tabular outline-none focus:ring-2 focus:ring-[var(--focus)]" />
          </form>
        ) : (
          <button
            onClick={() => {
              setEditing(true);
              setValue(String(Math.round(l.monthly / 100)));
            }}
            className="group inline-flex items-center gap-1.5 tabular text-fg-2 hover:text-fg"
            aria-label={`Edit ${categoryLabel(l.category)}: ${formatMoney(l.spent)} of ${formatMoney(l.monthly)}`}
          >
            <span className={cn(l.status === "over" && "text-caution")}>{formatMoney(l.spent)}</span>
            <span className="text-muted">/ {formatMoney(l.monthly)}</span>
            <Pencil size={12} className="text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
      </div>
      <div className="relative mt-1.5 h-1.5 rounded-full bg-surface-2" aria-hidden>
        {/* Fixed bills land on their own schedule, so only flexible categories are paced through the month. */}
        <div className={cn("absolute inset-y-0 left-0 rounded-full", l.status === "over" ? "bg-caution" : flexible && l.status === "over_pace" ? "bg-caution/70" : "bg-accent")} style={{ width: `${pct * 100}%` }} />
        {flexible && pace < 1 && <div className="absolute -top-0.5 h-2.5 w-px bg-muted" style={{ left: `${pace * 100}%` }} />}
      </div>
    </li>
  );
}

function RebuildButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await resetBudgetAction();
          router.refresh();
        })
      }
      className="mt-6 text-[13px] text-muted hover:text-fg disabled:opacity-50"
    >
      Rebuild from my recent spending
    </button>
  );
}
