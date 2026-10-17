"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { answerFactAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "./card";

const MONEY = new Set(["retirement_spending_annual", "outside_investments", "workplace_contribution_monthly", "social_security_annual", "home_price", "travel_budget_annual", "child_cost_monthly"]);

/** Progressive learning: at most one question, only when the answer would change the plan. */
export function QuestionCard({ q }: { q: { key: string; question: string; why: string } }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const money = MONEY.has(q.key);
  const submit = (skip: boolean) =>
    start(async () => {
      setError(null);
      const n = skip ? null : Number(value.replace(/[$,\s]/g, ""));
      if (!skip && (n == null || Number.isNaN(n))) return setError("Enter a number.");
      const r = await answerFactAction(q.key, n);
      if (!r.ok) return setError(r.error);
      setValue("");
      router.refresh();
    });
  return (
    <Card className="h-full">
      <Eyebrow>A quick question</Eyebrow>
      <p className="mt-2 text-[17px] font-medium tracking-[-0.01em]">{q.question}</p>
      <p className="mt-1 text-[13px] text-muted">{q.why}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
        className="mt-4 flex gap-2"
      >
        <label htmlFor={`q-${q.key}`} className="sr-only">
          {q.question}
        </label>
        <div className="relative min-w-0 flex-1">
          {money && <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">$</span>}
          <input
            id={`q-${q.key}`}
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={q.key === "birth_year" ? "1988" : money ? "0" : ""}
            className="h-11 w-full rounded-full bg-surface-2 pr-4 tabular outline-none focus:ring-2 focus:ring-[var(--focus)]"
            style={{ paddingLeft: money ? 28 : 16 }}
          />
        </div>
        <Button type="submit" variant="primary" busy={pending} disabled={!value.trim()}>
          Save
        </Button>
        <Button type="button" variant="quiet" onClick={() => submit(true)} disabled={pending}>
          Skip
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-caution">
          {error}
        </p>
      )}
    </Card>
  );
}
