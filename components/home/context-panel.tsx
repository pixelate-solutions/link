"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addContextAction, deleteMemoryAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

/**
 * Free-form context in the user's words: what an account is for, a one-off
 * gift, family plans. Link's assistant and categorizer take it into account.
 */
export function ContextPanel({ items }: { items: { id: string; content: string }[] }) {
  const [text, setText] = useState("");
  const [list, setList] = useState(items);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const add = () =>
    start(async () => {
      setError(null);
      const content = text.trim();
      const r = await addContextAction(content);
      if (!r.ok) return setError(r.error);
      setList((l) => [{ id: r.data.id, content }, ...l]);
      setText("");
      router.refresh();
    });

  const remove = (id: string) =>
    start(async () => {
      setList((l) => l.filter((x) => x.id !== id));
      await deleteMemoryAction(id);
    });

  return (
    <section className="h-full rounded-lg bg-surface p-5 md:p-6" aria-labelledby="context-title">
      <h2 id="context-title" className="text-[17px] font-semibold tracking-[-0.01em]">
        What Link should know
      </h2>
      <p className="mt-1 text-[13px] text-muted">Anything that explains your money. Link keeps it in mind when it sorts transactions and answers questions.</p>
      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length >= 3) add();
        }}
      >
        <label htmlFor="context" className="sr-only">
          Add context for Link
        </label>
        <textarea
          id="context"
          rows={2}
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim().length >= 3) add();
            }
          }}
          placeholder="My Novo account is for my business."
          className="min-w-0 flex-1 resize-none rounded-sm bg-surface-2 px-4 py-2.5 text-[14px] outline-none placeholder:text-muted focus:ring-2 focus:ring-[var(--focus)]"
        />
        <Button type="submit" size="sm" variant="primary" busy={pending} disabled={text.trim().length < 3} className="h-10">
          Add
        </Button>
      </form>
      {error && <p role="alert" className="mt-2 text-[13px] text-caution">{error}</p>}
      {list.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          <AnimatePresence initial={false}>
            {list.map((m) => (
              <motion.li key={m.id} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="group flex items-start gap-2 rounded-sm bg-surface-2 px-3 py-2 text-[14px]">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                <span className="min-w-0 flex-1">{m.content}</span>
                <button onClick={() => remove(m.id)} aria-label={`Forget: ${m.content}`} className="text-muted opacity-60 transition-opacity hover:text-caution hover:opacity-100">
                  <X size={14} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
