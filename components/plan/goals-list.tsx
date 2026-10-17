"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createGoalsAction, reorderGoalsAction, updateGoalAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { GoalView } from "@/lib/finance/plan";
import { formatMoney } from "@/lib/finance/money";

export function GoalsList({ goals }: { goals: GoalView[] }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ids = goals.map((g) => g.id);
  const move = (i: number, d: -1 | 1) =>
    start(async () => {
      const next = [...ids];
      [next[i], next[i + d]] = [next[i + d]!, next[i]!];
      await reorderGoalsAction(next);
      router.refresh();
    });
  return (
    <div>
      <ol className="space-y-2">
        {goals.map((g, i) => (
          <li key={g.id} className="flex items-center gap-3 rounded-md bg-surface-2 px-4 py-3">
            <span className="w-5 text-[13px] font-medium text-muted tabular">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{g.title}</span>
              <span className="block text-[13px] text-fg-2">
                {g.headline}
                {g.contributionMonthly > 0 && <span className="text-muted"> · {formatMoney(g.contributionMonthly)}/mo now</span>}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-0.5 text-muted">
              <button aria-label={`Move ${g.title} up`} disabled={i === 0 || pending} onClick={() => move(i, -1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-3 disabled:opacity-30">
                <ArrowUp size={15} />
              </button>
              <button aria-label={`Move ${g.title} down`} disabled={i === goals.length - 1 || pending} onClick={() => move(i, 1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-3 disabled:opacity-30">
                <ArrowDown size={15} />
              </button>
              <button aria-label={`Remove ${g.title}`} disabled={pending} onClick={() => start(async () => { await updateGoalAction(g.id, { status: "archived" }); router.refresh(); })} className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-3 hover:text-caution">
                <X size={15} />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            const r = await createGoalsAction(text);
            if (!r.ok) return setError(r.error);
            setText("");
            router.refresh();
          });
        }}
      >
        <label htmlFor="new-goal" className="sr-only">
          Add a goal in your own words
        </label>
        <input
          id="new-goal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a goal in your own words, e.g. buy a home in 2029"
          className="h-11 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-[14px] outline-none placeholder:text-muted focus:ring-2 focus:ring-[var(--focus)]"
        />
        <Button type="submit" busy={pending} disabled={!text.trim()}>
          Add
        </Button>
      </form>
      {error && <p className="mt-2 text-[13px] text-caution">{error}</p>}
    </div>
  );
}
