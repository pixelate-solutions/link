"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { answerFactAction, answerQuestionAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "./card";

const PLACEHOLDER: Record<string, string> = {
  birth_year: "1990",
  children_planned: "Maybe in a couple of years",
  emergency_months: "About six months",
  expected_income_change: "I'm getting a 10% raise in January",
};

/** Progressive learning: at most one question, answered in your own words. */
export function QuestionCard({ q }: { q: { key: string; question: string; why: string } }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const submit = (skip: boolean) =>
    start(async () => {
      setError(null);
      const r = skip ? await answerFactAction(q.key, null) : await answerQuestionAction(q.key, value);
      if (!r.ok) return setError(r.error);
      setValue("");
      setSaved(skip ? null : ((r.data as { understood?: string } | undefined)?.understood || "Saved."));
      router.refresh();
    });
  return (
    <Card className="h-full">
      <Eyebrow>A quick question</Eyebrow>
      <p className="mt-2 text-[17px] font-medium tracking-[-0.01em]">{q.question}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) submit(false);
        }}
        className="mt-4 flex gap-2"
      >
        <label htmlFor={`q-${q.key}`} className="sr-only">
          {q.question}
        </label>
        <input
          id={`q-${q.key}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={PLACEHOLDER[q.key] ?? "About $500"}
          className="h-11 min-w-0 flex-1 rounded-full bg-surface-2 px-4 outline-none placeholder:text-muted focus:ring-2 focus:ring-[var(--focus)]"
        />
        <Button type="submit" variant="primary" busy={pending} disabled={!value.trim()}>
          Save
        </Button>
        <Button type="button" variant="quiet" onClick={() => submit(true)} disabled={pending}>
          Skip
        </Button>
      </form>
      {saved && (
        <p role="status" className="mt-2 flex items-center gap-1.5 text-[13px] text-accent-ink">
          <Check size={14} /> {saved}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-caution">
          {error}
        </p>
      )}
    </Card>
  );
}
