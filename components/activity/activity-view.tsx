"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, MessageSquareText, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { explainReviewAction, recurringAction, searchAction, settleReviewAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type CategoryId, categoryLabel } from "@/lib/finance/categories";
import { isPaymentRail, railPayee } from "@/lib/finance/merchants";
import { formatMoney } from "@/lib/finance/money";
import type { Picture } from "@/lib/finance/plan";
import type { TxnListRow } from "@/server/services/activity";
import { cn, shortDate } from "@/lib/utils";
import { MerchantMark } from "./category-dot";
import { PICKABLE, pickLabel, reviewPrompt } from "./review";
import { TransactionSheet } from "./transaction-sheet";

type Filter = "all" | "review" | "recurring" | "income" | "transfers";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "review", label: "Needs a look" },
  { id: "recurring", label: "Recurring" },
  { id: "income", label: "Income" },
  { id: "transfers", label: "Transfers" },
];

function filterArgs(f: Filter, query: string, where: string) {
  // `where` is "", "scope:personal", "scope:<businessId>" or "acct:<accountId>".
  return {
    query: query || undefined,
    accountId: where.startsWith("acct:") ? where.slice(5) : undefined,
    scope: where.startsWith("scope:") ? where.slice(6) : undefined,
    review: f === "review" || undefined,
    kind: f === "income" ? "income" : f === "transfers" ? "transfer" : undefined,
    limit: 60,
  };
}

function dayLabel(date: string, today: string) {
  if (date === today) return "Today";
  const y = new Date(`${today}T00:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  if (date === y.toISOString().slice(0, 10)) return "Yesterday";
  return shortDate(date, { weekday: "short", month: "short", day: "numeric" });
}

export function ActivityView({
  initial,
  hasMore: initialMore,
  reviewCount,
  accounts,
  businesses,
  recurring,
  logos,
  today,
}: {
  initial: TxnListRow[];
  hasMore: boolean;
  reviewCount: number;
  accounts: { id: string; name: string; mask: string | null; businessId: string | null }[];
  businesses: { id: string; name: string }[];
  recurring: Picture["recurring"];
  logos: Record<string, string>;
  today: string;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>((params.get("filter") as Filter) || "all");
  const [query, setQuery] = useState("");
  const [accountId, setAccountId] = useState("");
  const [rows, setRows] = useState(initial);
  const [hasMore, setHasMore] = useState(initialMore);
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const first = useRef(true);

  const load = useCallback(
    (append = false) =>
      start(async () => {
        const last = append ? rows.at(-1) : undefined;
        const r = await searchAction({ ...filterArgs(filter, query, accountId), before: last ? { date: last.date, id: last.id } : undefined });
        if (!r.ok) return;
        setRows((prev) => (append ? [...prev, ...r.data.rows] : r.data.rows));
        setHasMore(r.data.hasMore);
      }),
    [filter, query, accountId, rows],
  );

  useEffect(() => {
    if (first.current && filter === "all" && !query && !accountId) {
      first.current = false;
      return;
    }
    first.current = false;
    if (filter === "recurring") return;
    const t = setTimeout(() => load(false), query ? 220 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, query, accountId]);

  const bizName = new Map(businesses.map((b) => [b.id, b.name]));
  const groups: { date: string; rows: TxnListRow[] }[] = [];
  for (const r of rows) {
    const g = groups.at(-1);
    if (g && g.date === r.date) g.rows.push(r);
    else groups.push({ date: r.date, rows: [r] });
  }

  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Activity</h1>
        <div className="relative md:w-80">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <label htmlFor="search" className="sr-only">
            Search transactions
          </label>
          <input
            id="search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search merchants, notes"
            className="h-11 w-full rounded-full bg-surface pl-10 pr-4 text-[15px] outline-none placeholder:text-muted focus:ring-2 focus:ring-[var(--focus)]"
          />
        </div>
      </div>

      <div className="-mx-5 mt-4 flex items-center gap-1.5 overflow-x-auto px-5 scrollbar-none md:mx-0 md:px-0" role="tablist" aria-label="Filter">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn("relative shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors", filter === f.id ? "text-bg" : "bg-surface text-fg-2 hover:text-fg")}
          >
            {filter === f.id && <motion.span layoutId="activity-filter" className="absolute inset-0 rounded-full bg-fg" />}
            <span className="relative">
              {f.label}
              {f.id === "review" && reviewCount > 0 && <span className="ml-1 tabular opacity-70">{reviewCount}</span>}
            </span>
          </button>
        ))}
        {(accounts.length > 1 || businesses.length > 0) && filter !== "recurring" && (
          <Select value={accountId || "all"} onValueChange={(v) => setAccountId(v === "all" ? "" : v)}>
            <SelectTrigger aria-label="Which accounts" size="sm" className="ml-auto h-8 max-w-[14rem] shrink-0 bg-surface px-3 text-[13px] text-fg-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All accounts</SelectItem>
              {businesses.length > 0 && (
                <SelectGroup>
                  <SelectSeparator />
                  <SelectLabel>Personal or business</SelectLabel>
                  <SelectItem value="scope:personal">Personal</SelectItem>
                  {businesses.map((b) => (
                    <SelectItem key={b.id} value={`scope:${b.id}`}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              <SelectGroup>
                <SelectSeparator />
                <SelectLabel>Account</SelectLabel>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={`acct:${a.id}`}>
                    {a.name}
                    {a.mask ? ` ··${a.mask}` : ""}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </div>

      {filter === "recurring" ? (
        <RecurringList recurring={recurring} logos={logos} onChanged={() => router.refresh()} />
      ) : filter === "review" && rows.length > 0 ? (
        <ReviewList
          rows={rows}
          busy={pending}
          onOpen={setOpen}
          onChanged={() => {
            load(false);
            router.refresh();
          }}
        />
      ) : (
        <div className={cn("mt-5 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
          {groups.length === 0 && !pending && (
            <p className="py-16 text-center text-[15px] text-muted">{filter === "review" ? "Nothing needs a look. Link sorted everything." : "No transactions match."}</p>
          )}
          {groups.map((g) => (
            <section key={g.date} className="mb-5">
              <h2 className="mb-1 px-1 text-[12px] font-medium text-muted">{dayLabel(g.date, today)}</h2>
              <ul className="overflow-hidden rounded-lg bg-surface">
                {g.rows.map((r) => (
                  <li key={r.id} className="border-b border-line last:border-0">
                    <button onClick={() => setOpen(r.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2">
                      <MerchantMark name={r.merchant} cat={r.category} logo={r.logoUrl} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[15px] font-medium">{r.merchant}</span>
                          {r.needsReview && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-caution" aria-label="Needs a look" />}
                        </span>
                        <span className="block truncate text-[13px] text-muted">
                          {r.hasSplits ? "Split" : categoryLabel(r.category)}
                          {r.pending && " · Pending"}
                          {r.accountMask && ` · ··${r.accountMask}`}
                          {r.businessId && <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-px text-[11px] font-medium text-accent-ink">{bizName.get(r.businessId) ?? "Business"}</span>}
                        </span>
                      </span>
                      <span className={cn("shrink-0 text-[15px] tabular", r.amount > 0 && "text-accent-ink", r.pending && "opacity-60")}>{formatMoney(r.amount, { cents: true, signed: r.amount > 0 })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {hasMore && (
            <div className="flex justify-center py-4">
              <Button onClick={() => load(true)} busy={pending}>
                Show more
              </Button>
            </div>
          )}
        </div>
      )}

      <TransactionSheet id={open} onClose={() => setOpen(null)} onChanged={() => load(false)} />
    </div>
  );
}

const MONTHLY: Record<string, number> = { weekly: 52 / 12, biweekly: 26 / 12, semimonthly: 2, monthly: 1, quarterly: 1 / 3, semiannual: 1 / 6, annual: 1 / 12 };

function RecurringList({ recurring, logos, onChanged }: { recurring: Picture["recurring"]; logos: Record<string, string>; onChanged: () => void }) {
  const [pending, start] = useTransition();
  const visible = recurring.filter((r) => r.kind === "income" || r.kind === "bill" || r.kind === "subscription" || (r.kind === "savings" && r.amount < 0));
  const sections = [
    { title: "Income", items: visible.filter((r) => r.kind === "income") },
    { title: "Bills & subscriptions", items: visible.filter((r) => r.kind === "bill" || r.kind === "subscription") },
    { title: "Saving & investing", items: visible.filter((r) => r.kind === "savings") },
  ].filter((s) => s.items.length);
  if (!sections.length) return <p className="py-16 text-center text-muted">No regular income or bills detected yet.</p>;
  return (
    <div className={cn("mt-5 space-y-5", pending && "opacity-60")}>
      {sections.map((s) => (
        <section key={s.title}>
          <div className="mb-1 flex justify-between px-1 text-[12px] font-medium text-muted">
            <h2>{s.title}</h2>
            <span className="tabular">{formatMoney(Math.round(s.items.reduce((a, r) => a + Math.abs(r.amount) * (MONTHLY[r.cadence] ?? 1), 0)))}/mo</span>
          </div>
          <ul className="overflow-hidden rounded-lg bg-surface">
            {s.items.map((r) => (
              <li key={r.key} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                <MerchantMark name={r.merchant} cat={r.category} logo={logos[r.merchant.toLowerCase()]} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{r.merchant}</span>
                  <span className="block truncate text-[13px] text-muted">
                    {r.cadence}
                    {r.nextDate && ` · next ${shortDate(r.nextDate)}`}
                  </span>
                </span>
                <span className="text-right">
                  <span className={cn("block text-[15px] tabular", r.amount > 0 && "text-accent-ink")}>{formatMoney(r.amount, { signed: r.amount > 0 })}</span>
                  <button onClick={() => start(async () => { await recurringAction(r.key, "ignored"); onChanged(); })} className="text-[12px] text-muted hover:text-fg">
                    Not recurring
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * "Needs a look", grouped by merchant and direction: one answer settles every
 * transaction in the group and teaches Link the merchant for the future.
 */
function ReviewList({ rows, busy, onOpen, onChanged }: { rows: TxnListRow[]; busy: boolean; onOpen: (id: string) => void; onChanged: () => void }) {
  const [notice, setNotice] = useState<{ text: string; hint?: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groups = new Map<string, TxnListRow[]>();
  for (const r of rows) {
    if (!r.needsReview) continue;
    // Payment rails (Zelle, checks) group by the bank's description, i.e. by who was paid.
    const key = `${r.merchantKey}|${r.amount < 0 ? "out" : "in"}${isPaymentRail(r.merchantKey) ? `|${railPayee(r.merchantKey, r.name).toLowerCase()}` : ""}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return (
    <div className="mt-5">
      {notice && (
        <div className="mt-3 px-1 text-[14px]" role="status">
          <p className="flex items-center gap-1.5 text-accent-ink">
            <Check size={15} /> {notice.text}
          </p>
          {notice.hint && <p className="mt-0.5 text-[13px] text-muted">{notice.hint}</p>}
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-[13px] text-caution">{error}</p>}
      <ul className="mt-3 space-y-2">
        {[...groups.entries()].map(([key, items]) => (
          <ReviewCard
            key={key}
            items={items}
            busy={busy}
            onOpen={onOpen}
            onDone={(text, hint) => {
              setError(null);
              setNotice({ text, hint });
              onChanged();
            }}
            onError={setError}
          />
        ))}
      </ul>
    </div>
  );
}

/** One merchant (or one payee) to answer for. Every transaction the answer covers is listed. */
function ReviewCard({
  items,
  busy,
  onOpen,
  onDone,
  onError,
}: {
  items: TxnListRow[];
  busy: boolean;
  onOpen: (id: string) => void;
  onDone: (text: string, hint?: string | null) => void;
  onError: (e: string) => void;
}) {
  const first = items[0]!;
  const many = items.length > 1;
  const rail = isPaymentRail(first.merchantKey);
  const [open, setOpen] = useState(items.length <= 5);
  const [explaining, setExplaining] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const p = reviewPrompt(first.reason, first.category, first.kind, first.amount);
  const total = items.reduce((s, r) => s + r.amount, 0);
  const ids = items.map((x) => x.id);

  const settle = (cat: string | null) =>
    start(async () => {
      const r = await settleReviewAction(ids, cat);
      if (!r.ok) return onError(r.error);
      const label = pickLabel((cat ?? first.category) as CategoryId);
      onDone(rail || !many ? `${many ? `All ${items.length} saved` : "Saved"} as ${label}.` : `${first.merchant} is ${label}. Link will remember that.`);
    });
  const explain = () =>
    start(async () => {
      const r = await explainReviewAction(ids, text);
      if (!r.ok) return onError(r.error);
      onDone(`${many ? `All ${items.length} saved` : "Saved"} as ${pickLabel(r.data.category as CategoryId)}${r.data.why ? `: ${r.data.why}` : "."}`, r.data.hint);
    });

  return (
    <motion.li layout className={cn("rounded-lg bg-surface p-4", pending && "opacity-70")}>
      <div className="flex items-start gap-3">
        <button onClick={() => onOpen(first.id)} className="shrink-0" aria-label={`Open ${first.merchant}`}>
          <MerchantMark name={first.merchant} cat={first.category} logo={first.logoUrl} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <button onClick={() => onOpen(first.id)} className="truncate text-left text-[15px] font-medium hover:underline">
              {first.merchant}
            </button>
            <span className={cn("shrink-0 text-[15px] tabular", total > 0 && "text-accent-ink")}>{formatMoney(total, { cents: !many, signed: total > 0 })}</span>
          </div>
          <p className="truncate text-[13px] text-muted">
            {rail && `${railPayee(first.merchantKey, first.name)} · `}
            {many ? `${items.length} transactions, ${first.amount < 0 ? "money out" : "money in"}` : `${shortDate(first.date)} · ${first.accountName}${first.accountMask ? ` ··${first.accountMask}` : ""}`}
          </p>

          {many && (
            <div className="mt-2">
              <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1 text-[13px] font-medium text-fg-2 hover:text-fg">
                {open ? "Hide" : "Show"} the {items.length} transactions
                <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <li className="mt-2 divide-y divide-line overflow-hidden rounded-sm border border-line">
                      {items.map((r) => (
                        <button key={r.id} onClick={() => onOpen(r.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] hover:bg-surface-2">
                          <span className="w-24 shrink-0 tabular text-muted">{shortDate(r.date)}</span>
                          <span className="min-w-0 flex-1 truncate text-fg-2">
                            {r.name}
                            {r.accountMask && <span className="text-muted"> · ··{r.accountMask}</span>}
                            {r.note && <span className="text-muted"> · “{r.note}”</span>}
                          </span>
                          <span className={cn("shrink-0 tabular", r.amount > 0 && "text-accent-ink")}>{formatMoney(r.amount, { cents: true, signed: r.amount > 0 })}</span>
                        </button>
                      ))}
                    </li>
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          )}

          <p className="mt-3 text-[15px] font-medium">{p.ask}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" busy={pending && !explaining} disabled={busy || pending} onClick={() => settle(null)}>
              <Check size={14} /> Yes{many ? `, all ${items.length}` : ""}
            </Button>
            <Select value="" onValueChange={(v) => settle(v)} disabled={pending}>
              <SelectTrigger aria-label={`Choose the right category for ${first.merchant}`} className="h-8 text-[13px]">
                <SelectValue placeholder="No, it's…" />
              </SelectTrigger>
              <SelectContent>
                {PICKABLE.map((c) => (
                  <SelectItem key={c} value={c}>
                    {pickLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!explaining && (
              <button onClick={() => setExplaining(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-accent-ink hover:bg-accent-soft">
                <MessageSquareText size={14} /> Explain what happened
              </button>
            )}
          </div>
          {explaining && (
            <form
              className="mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim().length >= 3) explain();
              }}
            >
              <label htmlFor={`explain-${first.id}`} className="sr-only">
                What happened
              </label>
              <textarea
                id={`explain-${first.id}`}
                autoFocus
                rows={2}
                maxLength={500}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (text.trim().length >= 3) explain();
                  }
                }}
                placeholder={first.amount < 0 ? "e.g. I moved money from my personal account to my business account" : "e.g. My business account paid me"}
                className="w-full resize-none rounded-sm bg-surface-2 px-3.5 py-2.5 text-[14px] outline-none placeholder:text-muted focus:ring-2 focus:ring-[var(--focus)]"
              />
              <div className="mt-2 flex items-center gap-2">
                <Button type="submit" size="sm" variant="primary" busy={pending} disabled={text.trim().length < 3}>
                  Save{many ? ` for all ${items.length}` : ""}
                </Button>
                <Button type="button" size="sm" variant="quiet" onClick={() => setExplaining(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </motion.li>
  );
}
