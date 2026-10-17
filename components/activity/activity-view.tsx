"use client";

import { motion } from "motion/react";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { recurringAction, searchAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { categoryLabel } from "@/lib/finance/categories";
import { formatMoney } from "@/lib/finance/money";
import type { Picture } from "@/lib/finance/plan";
import type { TxnListRow } from "@/server/services/activity";
import { cn, shortDate } from "@/lib/utils";
import { MerchantMark } from "./category-dot";
import { TransactionSheet } from "./transaction-sheet";

type Filter = "all" | "review" | "recurring" | "income" | "transfers";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "review", label: "Needs a look" },
  { id: "recurring", label: "Recurring" },
  { id: "income", label: "Income" },
  { id: "transfers", label: "Transfers" },
];

function filterArgs(f: Filter, query: string, accountId: string) {
  return {
    query: query || undefined,
    accountId: accountId || undefined,
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
  recurring,
  today,
}: {
  initial: TxnListRow[];
  hasMore: boolean;
  reviewCount: number;
  accounts: { id: string; name: string; mask: string | null }[];
  recurring: Picture["recurring"];
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
        {accounts.length > 1 && filter !== "recurring" && (
          <select
            aria-label="Account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="ml-auto h-8 shrink-0 rounded-full bg-surface px-3 text-[13px] text-fg-2 outline-none"
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.mask ? ` ··${a.mask}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {filter === "recurring" ? (
        <RecurringList recurring={recurring} onChanged={() => router.refresh()} />
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
                      <MerchantMark name={r.merchant} cat={r.category} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[15px] font-medium">{r.merchant}</span>
                          {r.needsReview && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-caution" aria-label="Needs a look" />}
                        </span>
                        <span className="block truncate text-[13px] text-muted">
                          {r.hasSplits ? "Split" : categoryLabel(r.category)}
                          {r.pending && " · Pending"}
                          {r.accountMask && ` · ··${r.accountMask}`}
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

function RecurringList({ recurring, onChanged }: { recurring: Picture["recurring"]; onChanged: () => void }) {
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
                <MerchantMark name={r.merchant} cat={r.category} />
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
