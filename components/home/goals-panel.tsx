"use client";

import { motion } from "motion/react";
import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createGoalsAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { GoalView } from "@/lib/finance/plan";
import { cn } from "@/lib/utils";

const IDEAS = ["Have kids in a few years", "Retire by 55", "Move closer to family in 10 years", "Buy a house", "Take a sabbatical"];

/**
 * Goals and life plans, in the user's words. Life plans ("three or four kids",
 * "move back home in ten years") shape the plan as much as dollar targets do.
 */
export function GoalsPanel({ goals }: { goals: GoalView[] }) {
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(goals.length === 0);
  const [heard, setHeard] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await createGoalsAction(text);
      if (!r.ok) return setError(r.error);
      setHeard(`Added: ${r.data.map((g) => g.title).join(", ")}. Link is factoring it in.`);
      setText("");
      setAdding(false);
      router.refresh();
    });

  return (
    <section className="h-full rounded-lg bg-surface p-5 md:p-6" aria-labelledby="goals-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="goals-title" className="text-[17px] font-semibold tracking-[-0.01em]">
          Your goals &amp; life plans
        </h2>
        <Link href="/plan#goals" className="inline-flex items-center gap-1 text-[13px] font-medium text-fg-2 hover:text-fg">
          Plan <ArrowRight size={14} />
        </Link>
      </div>

      {goals.length > 0 && (
        <ul className="mt-4 divide-y divide-line">
          {goals.slice(0, 5).map((g) => (
            <li key={g.id}>
              <Link href="/plan#goals" className="group flex items-center gap-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{g.title}</span>
                  <span className="block truncate text-[13px] text-muted">{g.detail}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={cn("block text-[15px] font-semibold tracking-[-0.01em]", g.status === "behind" || g.status === "not_reachable" ? "text-caution" : "text-fg")}>{g.headline}</span>
                  {g.progress != null && (
                    <span className="mt-1.5 block h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                      <motion.span className="block h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${Math.max(3, g.progress * 100)}%` }} />
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {heard && <p className="mt-3 text-[13px] text-accent-ink" role="status">{heard}</p>}

      {adding ? (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) submit();
          }}
        >
          <label htmlFor="new-goal" className="sr-only">
            A goal or life plan, in your own words
          </label>
          <textarea
            id="new-goal"
            rows={2}
            value={text}
            autoFocus={goals.length > 0}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (text.trim()) submit();
              }
            }}
            placeholder="In a couple of years we want our first kid, and three or four eventually."
            className="w-full resize-none rounded-sm bg-surface-2 px-4 py-3 text-[15px] outline-none placeholder:text-muted focus:ring-2 focus:ring-[var(--focus)]"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {IDEAS.map((i) => (
              <button type="button" key={i} onClick={() => setText(i)} className="rounded-full bg-surface-2 px-3 py-1 text-[12px] text-fg-2 hover:bg-surface-3">
                {i}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button type="submit" size="sm" variant="primary" busy={pending} disabled={!text.trim()}>
              Add to my plan
            </Button>
            {goals.length > 0 && (
              <Button type="button" size="sm" variant="quiet" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            )}
          </div>
          {error && <p role="alert" className="mt-2 text-[13px] text-caution">{error}</p>}
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-2 text-[13px] font-medium text-accent-ink transition-opacity hover:opacity-80">
          <Plus size={14} /> Add a goal or life plan
        </button>
      )}
    </section>
  );
}
