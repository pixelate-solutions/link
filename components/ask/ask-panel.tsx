"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { proposalAction } from "@/app/actions";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { RichText } from "./rich-text";

interface Proposal {
  id: string;
  summary: string;
  status: "pending" | "approved" | "rejected";
}
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposals?: Proposal[];
  scenarios?: string[];
  working?: string | null;
  error?: boolean;
  offline?: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  get_financial_overview: "Reading your accounts",
  get_goals: "Checking your goals",
  get_recommendations: "Weighing your options",
  get_cash_forecast: "Projecting your cash",
  get_spending: "Looking at your spending",
  search_transactions: "Searching transactions",
  explain_transaction: "Checking that transaction",
  get_recurring: "Reviewing recurring charges",
  run_scenario: "Modeling the scenario",
  check_affordability: "Checking what fits",
  debt_payoff: "Comparing payoff plans",
  get_memories: "Remembering what you said",
  save_fact: "Saving that",
  remember: "Saving that",
  propose_preferences: "Preparing a change for you",
  propose_goal: "Preparing a change for you",
  propose_budget_change: "Preparing a change for you",
  propose_rule: "Preparing a rule",
};

const SUGGESTIONS = ["Am I on track?", "How much can I spend this week?", "What should I do next?", "What if I spent $300 less a month?"];

export function AskPanel({ open, onOpenChange, prefill, autoSend, nonce }: { open: boolean; onOpenChange: (o: boolean) => void; prefill?: string; autoSend?: boolean; nonce: number }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    fetch("/api/conversations")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { conversationId: string | null; messages: { id: string; role: "user" | "assistant"; content: string; parts?: { proposals?: { id: string }[]; scenarios?: string[] } }[]; proposals?: Proposal[] } | null) => {
        if (!d?.conversationId) return;
        const props = new Map((d.proposals ?? []).map((p) => [p.id, p]));
        setConversationId(d.conversationId);
        setMessages(
          d.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            scenarios: m.parts?.scenarios,
            proposals: m.parts?.proposals?.map((p) => props.get(p.id)).filter((p): p is Proposal => Boolean(p)),
          })),
        );
      })
      .catch(() => {});
  }, [open, loaded]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      setInput("");
      setBusy(true);
      const assistantId = `a${Date.now()}`;
      setMessages((m) => [...m, { id: `u${Date.now()}`, role: "user", content: message }, { id: assistantId, role: "assistant", content: "", working: "Thinking" }]);
      const patch = (fn: (m: Message) => Message) => setMessages((all) => all.map((m) => (m.id === assistantId ? fn(m) : m)));
      try {
        const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, conversationId }) });
        if (!res.ok || !res.body) throw new Error(res.status === 401 ? "Your session ended. Sign in again." : "Link couldn't answer right now.");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const e = JSON.parse(line);
            if (e.type === "conversation") setConversationId(e.id);
            else if (e.type === "text") patch((m) => ({ ...m, content: m.content + e.delta, working: null }));
            else if (e.type === "tool" && e.status === "start") patch((m) => ({ ...m, working: TOOL_LABELS[e.name] ?? "Working" }));
            else if (e.type === "proposal") patch((m) => ({ ...m, proposals: [...(m.proposals ?? []), { id: e.id, summary: e.summary, status: "pending" }] }));
            else if (e.type === "scenario") patch((m) => ({ ...m, scenarios: [...(m.scenarios ?? []), e.id] }));
            else if (e.type === "done") patch((m) => ({ ...m, working: null, offline: e.mode === "offline" }));
            else if (e.type === "error") patch((m) => ({ ...m, working: null, error: true, content: m.content || e.message }));
          }
        }
        router.refresh();
      } catch (err) {
        patch((m) => ({ ...m, working: null, error: true, content: (err as Error).message }));
      } finally {
        setBusy(false);
        field.current?.focus();
      }
    },
    [busy, conversationId, router],
  );

  useEffect(() => {
    if (!open) return;
    if (prefill && autoSend) void send(prefill);
    else if (prefill) setInput(prefill);
    const t = setTimeout(() => field.current?.focus(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Ask Link" wide className="md:inset-y-3">
      <div className="flex h-full min-h-[60dvh] flex-col md:min-h-0">
        <div ref={scroller} className="-mx-5 flex-1 space-y-5 overflow-y-auto px-5 pb-4" aria-live="polite">
          {messages.length === 0 ? (
            <div className="pt-6">
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => void send(s)} className="rounded-full bg-surface-2 px-3.5 py-2 text-[13px] text-fg transition-colors hover:bg-surface-3">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <Bubble key={m.id} m={m} onResolved={(id, status) => setMessages((all) => all.map((x) => ({ ...x, proposals: x.proposals?.map((p) => (p.id === id ? { ...p, status } : p)) })))} />)
          )}
        </div>
        <form onSubmit={onSubmit} className="relative mt-2 flex items-end gap-2 rounded-md bg-surface-2 p-1.5 pl-4 focus-within:ring-2 focus-within:ring-[var(--focus)]">
          <label htmlFor="ask-input" className="sr-only">
            Ask Link
          </label>
          <textarea
            id="ask-input"
            ref={field}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="What if I…"
            className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-muted"
          />
          <motion.button
            whileTap={{ scale: 0.94 }}
            type="submit"
            disabled={!input.trim() || busy}
            aria-label="Send"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fg text-bg transition-opacity disabled:opacity-30"
          >
            <ArrowUp size={18} />
          </motion.button>
        </form>
      </div>
    </Sheet>
  );
}

function Bubble({ m, onResolved }: { m: Message; onResolved: (id: string, status: Proposal["status"]) => void }) {
  if (m.role === "user") {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[85%] rounded-md rounded-br-sm bg-fg px-3.5 py-2.5 text-[15px] text-bg">{m.content}</div>
      </motion.div>
    );
  }
  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {m.working && !m.content && (
          <motion.div key="working" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-[13px] text-muted">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            {m.working}…
          </motion.div>
        )}
      </AnimatePresence>
      {m.content && (
        <div className={cn("text-[15px] leading-relaxed", m.error ? "text-caution" : "text-fg")}>
          <RichText text={m.content} />
        </div>
      )}
      {m.proposals?.map((p) => <ProposalCard key={p.id} p={p} onResolved={onResolved} />)}
      {m.scenarios?.slice(-1).map((id) => (
        <Link key={id} href={`/plan?scenario=${id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-ink hover:underline">
          Compare in Plan <ChevronRight size={14} />
        </Link>
      ))}
    </div>
  );
}

function ProposalCard({ p, onResolved }: { p: Proposal; onResolved: (id: string, status: Proposal["status"]) => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const act = (approve: boolean) =>
    start(async () => {
      const r = await proposalAction(p.id, approve);
      if (!r.ok) return setError(r.error);
      onResolved(p.id, approve ? "approved" : "rejected");
      router.refresh();
    });
  return (
    <motion.div layout className="rounded-md border border-line bg-surface p-4">
      <p className="text-[13px] text-muted">Change to your plan</p>
      <p className="mt-1 text-[15px] font-medium">{p.summary || "Proposed change"}</p>
      {p.status === "pending" ? (
        <div className="mt-3 flex gap-2">
          <button onClick={() => act(true)} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-4 text-[13px] font-medium text-bg disabled:opacity-50">
            <Check size={14} /> Approve
          </button>
          <button onClick={() => act(false)} disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted hover:text-fg">
            <X size={14} /> Not now
          </button>
        </div>
      ) : (
        <p className={cn("mt-2 text-[13px]", p.status === "approved" ? "text-accent-ink" : "text-muted")}>{p.status === "approved" ? "Approved. Your plan is updated." : "Declined. Nothing changed."}</p>
      )}
      {error && <p className="mt-2 text-[13px] text-caution">{error}</p>}
    </motion.div>
  );
}
