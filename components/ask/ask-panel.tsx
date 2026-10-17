"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, ChevronRight, Download, FileText, History, Paperclip, SquarePen, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { proposalAction } from "@/app/actions";
import { Sheet } from "@/components/ui/sheet";
import { cn, relativeTime } from "@/lib/utils";
import { RichText } from "./rich-text";

interface Proposal {
  id: string;
  summary: string;
  status: "pending" | "approved" | "rejected";
}
interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  source: string;
}
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
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
  get_businesses: "Looking at your business",
  image_generation: "Creating an image",
  code_interpreter: "Running the numbers",
  create_file: "Making your file",
};

const SUGGESTIONS = ["Am I on track?", "How much can I spend this week?", "What should I do next?", "What if I spent $300 less a month?"];

type ChatSummary = { id: string; title: string | null; updatedAt: string };
type Draft = { key: string; name: string; mime: string; size: number; status: "uploading" | "ready" | "error"; id?: string; preview?: string; error?: string };

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,.pdf,.csv,.txt,.md,.json,text/csv,text/plain,text/markdown,application/json";
const MAX_FILES = 8;

/** Phone photos are large: shrink big images before upload so they fit and send fast. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size <= 1_500_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

function toMessages(d: { messages: { id: string; role: "user" | "assistant"; content: string; parts?: { proposals?: { id: string }[]; scenarios?: string[] } | null; attachments?: Attachment[] }[]; proposals?: Proposal[] }): Message[] {
  const props = new Map((d.proposals ?? []).map((p) => [p.id, p]));
  return d.messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    attachments: m.attachments,
    scenarios: m.parts?.scenarios,
    proposals: m.parts?.proposals?.map((p) => props.get(p.id)).filter((p): p is Proposal => Boolean(p)),
  }));
}

export function AskPanel({ open, onOpenChange, prefill, autoSend, nonce }: { open: boolean; onOpenChange: (o: boolean) => void; prefill?: string; autoSend?: boolean; nonce: number }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [input, setInput] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const router = useRouter();

  const loadChats = useCallback(async () => {
    const r = await fetch("/api/conversations").catch(() => null);
    if (!r?.ok) return [];
    const d = (await r.json()) as { conversations: ChatSummary[] };
    setChats(d.conversations);
    return d.conversations;
  }, []);

  const openChat = useCallback(async (id: string) => {
    setView("chat");
    setLoading(true);
    const r = await fetch(`/api/conversations/${id}`).catch(() => null);
    setLoading(false);
    if (!r?.ok) return;
    const d = await r.json();
    setConversationId(d.conversation.id);
    setTitle(d.conversation.title);
    setMessages(toMessages(d));
  }, []);

  const newChat = useCallback(() => {
    if (busy) return;
    setView("chat");
    setConversationId(null);
    setTitle(null);
    setMessages([]);
    setTimeout(() => field.current?.focus(), 50);
  }, [busy]);

  // First open: pick up where the user left off.
  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    void loadChats().then((list) => {
      if (list[0] && !autoSend) void openChat(list[0].id);
    });
  }, [open, loaded, loadChats, openChat, autoSend]);

  const remove = async (id: string) => {
    setChats((c) => c?.filter((x) => x.id !== id) ?? null);
    if (id === conversationId) {
      // Stay in the list; the next message starts a fresh chat.
      setConversationId(null);
      setTitle(null);
      setMessages([]);
    }
    await fetch(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => {});
  };

  useEffect(() => {
    if (view === "chat") scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, view]);

  const addFiles = useCallback((list: FileList | File[]) => {
    const files = Array.from(list).slice(0, MAX_FILES);
    for (const raw of files) {
      const key = `${Date.now()}-${Math.random()}`;
      const preview = raw.type.startsWith("image/") ? URL.createObjectURL(raw) : undefined;
      setDrafts((d) => (d.length >= MAX_FILES ? d : [...d, { key, name: raw.name, mime: raw.type, size: raw.size, status: "uploading", preview }]));
      void (async () => {
        const file = await shrink(raw);
        const form = new FormData();
        form.append("file", file);
        const r = await fetch("/api/attachments", { method: "POST", body: form }).catch(() => null);
        const d = r ? await r.json().catch(() => ({})) : {};
        setDrafts((all) =>
          all.map((x) => (x.key !== key ? x : r?.ok ? { ...x, status: "ready", id: d.id, name: d.name, mime: d.mime, size: d.size } : { ...x, status: "error", error: d.error ?? "Couldn't upload" })),
        );
      })();
    }
    field.current?.focus();
  }, []);

  const send = useCallback(
    async (text: string, fresh = false) => {
      const message = text.trim();
      const ready = drafts.filter((d) => d.status === "ready" && d.id);
      if ((!message && !ready.length) || busy || drafts.some((d) => d.status === "uploading")) return;
      setInput("");
      setDrafts([]);
      setBusy(true);
      setView("chat");
      const assistantId = `a${Date.now()}`;
      const sent: Attachment[] = ready.map((d) => ({ id: d.id!, name: d.name, mime: d.mime, size: d.size, source: "upload" }));
      setMessages((m) => [...m, { id: `u${Date.now()}`, role: "user", content: message, attachments: sent }, { id: assistantId, role: "assistant", content: "", working: ready.length ? "Reading your files" : "Thinking" }]);
      const patch = (fn: (m: Message) => Message) => setMessages((all) => all.map((m) => (m.id === assistantId ? fn(m) : m)));
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, conversationId: fresh ? null : conversationId, attachmentIds: sent.map((a) => a.id) }),
        });
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
            if (e.type === "conversation") {
              setConversationId(e.id);
              setTitle((t) => t ?? (message.slice(0, 60) || sent[0]?.name || "New chat"));
            } else if (e.type === "text") patch((m) => ({ ...m, content: m.content + e.delta, working: null }));
            else if (e.type === "tool" && e.status === "start") patch((m) => ({ ...m, working: TOOL_LABELS[e.name] ?? "Working" }));
            else if (e.type === "file") patch((m) => ({ ...m, attachments: [...(m.attachments ?? []), e.file] }));
            else if (e.type === "proposal") patch((m) => ({ ...m, proposals: [...(m.proposals ?? []), { id: e.id, summary: e.summary, status: "pending" }] }));
            else if (e.type === "scenario") patch((m) => ({ ...m, scenarios: [...(m.scenarios ?? []), e.id] }));
            else if (e.type === "done") patch((m) => ({ ...m, working: null, offline: e.mode === "offline" }));
            else if (e.type === "error") patch((m) => ({ ...m, working: null, error: true, content: m.content || e.message }));
          }
        }
        router.refresh();
        void loadChats();
      } catch (err) {
        patch((m) => ({ ...m, working: null, error: true, content: (err as Error).message }));
      } finally {
        setBusy(false);
        field.current?.focus();
      }
    },
    [busy, conversationId, drafts, router, loadChats],
  );

  useEffect(() => {
    if (!open) return;
    // A prompt from elsewhere in the app ("What if…", "Why?") starts its own chat.
    if (prefill && autoSend) {
      setConversationId(null);
      setTitle(null);
      setMessages([]);
      setView("chat");
      void send(prefill, true);
    } else if (prefill) setInput(prefill);
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
  const uploading = drafts.some((d) => d.status === "uploading");
  const canSend = !busy && !uploading && (input.trim().length > 0 || drafts.some((d) => d.status === "ready"));

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Ask Link" wide className="md:inset-y-3">
      <div
        className="relative flex h-full min-h-[60dvh] flex-col md:min-h-0"
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragging(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <div className="-mx-5 flex items-center gap-1 border-b border-line px-3 pb-2">
          <button
            onClick={() => {
              setView((v) => (v === "history" ? "chat" : "history"));
              void loadChats();
            }}
            aria-pressed={view === "history"}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors", view === "history" ? "bg-fg text-bg" : "text-fg-2 hover:bg-surface-2")}
          >
            <History size={15} /> Chats
          </button>
          <p className="min-w-0 flex-1 truncate px-2 text-center text-[13px] text-muted">{view === "history" ? "Your chats" : (title ?? "New chat")}</p>
          <button onClick={newChat} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-fg-2 transition-colors hover:bg-surface-2 disabled:opacity-40">
            <SquarePen size={15} /> New chat
          </button>
        </div>

        {view === "history" ? (
          <ChatList chats={chats} current={conversationId} onOpen={(id) => void openChat(id)} onDelete={(id) => void remove(id)} />
        ) : (
          <div ref={scroller} className="-mx-5 flex-1 space-y-5 overflow-y-auto px-5 pt-4 pb-4" aria-live="polite">
            {loading ? (
              <div className="space-y-3 pt-2" aria-busy>
                <div className="ml-auto h-10 w-2/3 animate-pulse rounded-md bg-surface-2" />
                <div className="h-20 w-full animate-pulse rounded-md bg-surface-2" />
              </div>
            ) : messages.length === 0 ? (
              <div className="pt-2">
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => void send(s)} className="rounded-full bg-surface-2 px-3.5 py-2 text-[13px] text-fg transition-colors hover:bg-surface-3">
                      {s}
                    </button>
                  ))}
                </div>
                <p className="mt-6 text-[13px] text-muted">You can also drop in a statement, receipt or screenshot, or ask Link for a chart or a spreadsheet.</p>
              </div>
            ) : (
              messages.map((m) => <Bubble key={m.id} m={m} onResolved={(id, status) => setMessages((all) => all.map((x) => ({ ...x, proposals: x.proposals?.map((p) => (p.id === id ? { ...p, status } : p)) })))} />)
            )}
          </div>
        )}

        <form onSubmit={onSubmit} className="relative mt-2 rounded-md bg-surface-2 p-1.5 focus-within:ring-2 focus-within:ring-[var(--focus)]">
          {drafts.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 px-1.5 pt-1.5 pb-1">
              {drafts.map((d) => (
                <li key={d.key} className={cn("group relative flex h-12 max-w-[200px] items-center gap-2 rounded-sm bg-surface pr-7 text-[12px]", d.status === "error" && "ring-1 ring-caution")}>
                  {d.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.preview} alt="" className="h-12 w-12 shrink-0 rounded-l-sm object-cover" />
                  ) : (
                    <span className="grid h-12 w-10 shrink-0 place-items-center text-muted">
                      <FileText size={18} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{d.name}</span>
                    <span className={cn("block truncate", d.status === "error" ? "text-caution" : "text-muted")}>{d.status === "uploading" ? "Uploading…" : d.status === "error" ? d.error : formatSize(d.size)}</span>
                  </span>
                  {d.status === "uploading" && <span className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-muted border-r-transparent" aria-hidden />}
                  {d.status !== "uploading" && (
                    <button type="button" onClick={() => setDrafts((all) => all.filter((x) => x.key !== d.key))} aria-label={`Remove ${d.name}`} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted hover:text-fg">
                      <X size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-1.5">
            <input ref={picker} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && (addFiles(e.target.files), (e.target.value = ""))} />
            <button type="button" onClick={() => picker.current?.click()} aria-label="Attach files" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-fg">
              <Paperclip size={18} />
            </button>
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
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files);
                if (files.length) {
                  e.preventDefault();
                  addFiles(files);
                }
              }}
              placeholder={drafts.length ? "Ask about these files…" : "What if I…"}
              className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-muted"
            />
            <motion.button
              whileTap={{ scale: 0.94 }}
              type="submit"
              disabled={!canSend}
              aria-label="Send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fg text-bg transition-opacity disabled:opacity-30"
            >
              <ArrowUp size={18} />
            </motion.button>
          </div>
        </form>

        <AnimatePresence>
          {dragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-md border-2 border-dashed border-accent bg-surface/90"
            >
              <p className="flex items-center gap-2 text-[15px] font-medium text-accent-ink">
                <Paperclip size={18} /> Drop files to attach
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Sheet>
  );
}

function formatSize(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;
}

function ChatList({ chats, current, onOpen, onDelete }: { chats: ChatSummary[] | null; current: string | null; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  if (!chats) return <div className="flex-1" aria-busy />;
  if (!chats.length) return <p className="flex-1 pt-8 text-center text-[14px] text-muted">No chats yet.</p>;
  return (
    <ul className="-mx-5 flex-1 overflow-y-auto px-3 py-2">
      {chats.map((c) => (
        <li key={c.id} className={cn("group flex items-center gap-1 rounded-sm", c.id === current && "bg-surface-2")}>
          <button onClick={() => onOpen(c.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left">
            <span className="block truncate text-[14px] font-medium">{c.title || "Untitled chat"}</span>
            <span className="block text-[12px] text-muted">{relativeTime(c.updatedAt)}</span>
          </button>
          {confirming === c.id ? (
            <span className="flex shrink-0 items-center gap-1 pr-2">
              <button onClick={() => onDelete(c.id)} className="rounded-full bg-caution-soft px-3 py-1 text-[12px] font-medium text-caution">
                Delete
              </button>
              <button onClick={() => setConfirming(null)} className="rounded-full px-2 py-1 text-[12px] text-muted hover:text-fg">
                Keep
              </button>
            </span>
          ) : (
            <button onClick={() => setConfirming(c.id)} aria-label={`Delete "${c.title || "Untitled chat"}"`} className="mr-2 shrink-0 rounded-full p-2 text-muted opacity-60 transition-opacity hover:bg-surface-3 hover:text-caution group-hover:opacity-100">
              <Trash2 size={15} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A file on a message: images show inline, everything else is a download chip. */
function AttachmentView({ a, mine }: { a: Attachment; mine?: boolean }) {
  const url = `/api/attachments/${a.id}`;
  if (a.mime.startsWith("image/")) {
    return (
      <span className="group relative inline-block">
        <a href={url} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={a.name} loading="lazy" className={cn("rounded-sm bg-surface-2 object-cover", mine ? "max-h-40 max-w-[220px]" : "max-h-[420px] w-full max-w-md")} />
        </a>
        {!mine && (
          <a href={`${url}?download`} aria-label={`Download ${a.name}`} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-fg/80 text-bg opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
            <Download size={15} />
          </a>
        )}
      </span>
    );
  }
  return (
    <a href={`${url}?download`} className="inline-flex max-w-full items-center gap-2.5 rounded-sm border border-line bg-surface px-3 py-2 text-[13px] transition-colors hover:bg-surface-2">
      <FileText size={18} className="shrink-0 opacity-70" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{a.name}</span>
        <span className="block opacity-70">{formatSize(a.size)}</span>
      </span>
      {!mine && <Download size={15} className="ml-1 shrink-0 opacity-60" />}
    </a>
  );
}

function Bubble({ m, onResolved }: { m: Message; onResolved: (id: string, status: Proposal["status"]) => void }) {
  if (m.role === "user") {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-end gap-1.5">
        {m.attachments && m.attachments.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {m.attachments.map((a) => (
              <AttachmentView key={a.id} a={a} mine />
            ))}
          </div>
        )}
        {m.content && <div className="max-w-[85%] whitespace-pre-wrap rounded-md rounded-br-sm bg-fg px-3.5 py-2.5 text-[15px] text-bg">{m.content}</div>}
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
      {m.attachments && m.attachments.length > 0 && (
        <div className="flex flex-col items-start gap-2">
          {m.attachments.map((a) => (
            <AttachmentView key={a.id} a={a} />
          ))}
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
