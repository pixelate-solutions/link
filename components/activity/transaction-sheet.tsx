"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { correctAction, settleReviewAction, noteAction, revertAction, splitAction, transactionAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { type CategoryId, categoryLabel } from "@/lib/finance/categories";
import { isPaymentRail } from "@/lib/finance/merchants";
import { formatMoney } from "@/lib/finance/money";
import { cn, shortDate } from "@/lib/utils";
import { MerchantMark } from "./category-dot";
import { PICKABLE, reviewPrompt } from "./review";

type Detail = Extract<Awaited<ReturnType<typeof transactionAction>>, { ok: true }>["data"];

const SOURCE: Record<string, string> = {
  user: "You set this",
  rule: "One of your rules",
  learned: "Learned from you",
  structural: "Recognized from the transaction itself",
  transfer_match: "Matched with the other side of a transfer",
  provider: "From your bank's data",
  merchant: "Known merchant",
  history: "Your history with this merchant",
  ai: "Link's model",
  default: "Best guess",
};


export function TransactionSheet({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()} title="Transaction" hideTitle>
      {id && <TransactionDetail key={id} id={id} onChanged={onChanged} />}
    </Sheet>
  );
}

/** Keyed by transaction id, so every open starts from a clean state. */
function TransactionDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [t, setT] = useState<Detail | null>(null);
  const [allForMerchant, setAll] = useState(true);
  const [picking, setPicking] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [note, setNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    transactionAction(id).then((r) => {
      if (r.ok) {
        setT(r.data);
        setNote(r.data.note ?? "");
        // A Zelle or check payment says nothing about the next one: don't generalize by default.
        setAll(!isPaymentRail(r.data.merchantKey));
      } else setError(r.error);
    });
  }, [id]);

  const refresh = async () => {
    const r = await transactionAction(id);
    if (r.ok) setT(r.data);
    onChanged();
    router.refresh();
  };

  const choose = (cat: CategoryId) =>
    start(async () => {
      if (!t) return;
      const r = await correctAction(t.id, cat, allForMerchant);
      if (!r.ok) return setError(r.error);
      const others = (r.data as { updatedOthers: number }).updatedOthers;
      setSaved(allForMerchant && others ? `Updated ${others} other ${t.merchant} transaction${others === 1 ? "" : "s"} too.` : "Saved.");
      setPicking(false);
      await refresh();
    });

  const confirm = () =>
    start(async () => {
      if (!t) return;
      const r = await settleReviewAction([t.id], null);
      if (!r.ok) return setError(r.error);
      const others = (r.data as { updatedOthers: number }).updatedOthers;
      setSaved(
        isPaymentRail(t.merchantKey)
          ? "Got it. Saved for this payment."
          : `Got it. Link will treat ${t.merchant} as ${categoryLabel(t.category)}${others ? ` and updated ${others} other transaction${others === 1 ? "" : "s"}` : ""}.`,
      );
      await refresh();
    });

  const saveNote = () =>
    start(async () => {
      if (!t || note === (t.note ?? "")) return;
      const r = await noteAction(t.id, note);
      if (!r.ok) return setError(r.error);
      setT({ ...t, note: note || null });
      setNoteSaved(true);
    });

  return (
    <>
      {!t ? (
        <div className="space-y-3 pt-6" aria-busy>
          <div className="h-8 w-40 animate-pulse rounded-sm bg-surface-2" />
          <div className="h-24 animate-pulse rounded-md bg-surface-2" />
          {error && <p className="text-caution">{error}</p>}
        </div>
      ) : (
        <div className="pt-4">
          <div className="flex items-center gap-2.5">
            <MerchantMark name={t.merchant} cat={t.category} logo={t.logoUrl} className="h-8 w-8 text-[12px]" />
            <p className="text-[15px] font-medium text-fg-2">{t.merchant}</p>
          </div>
          <p className={cn("mt-1 text-figure font-semibold tabular", t.amountMinor > 0 && "text-accent-ink")}>{formatMoney(t.amountMinor, { cents: true, signed: t.amountMinor > 0 })}</p>
          <p className="mt-1 text-[13px] text-muted">
            {shortDate(t.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            {t.pending && " · Pending"}
          </p>

          {t.needsReview && !t.hasSplits && (
            <ReviewCallout t={t} busy={pending} onConfirm={confirm} onChange={() => setPicking(true)} />
          )}

          <div className="mt-6 rounded-md bg-surface-2 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] text-muted">Category</p>
                <p className="mt-0.5 text-[16px] font-medium">{t.hasSplits ? "Split" : categoryLabel(t.category)}</p>
              </div>
              <Button size="sm" variant={picking ? "primary" : "secondary"} onClick={() => setPicking((p) => !p)}>
                {picking ? "Cancel" : "Change"}
              </Button>
            </div>
            <p className="mt-3 text-[12px] text-muted">
              {SOURCE[t.classSource] ?? t.classSource}
              {t.classSource !== "user" && ` · ${Math.round(t.confidence * 100)}% sure`}
            </p>
            {t.reason && t.classSource !== "user" && <p className="mt-0.5 text-[13px] text-fg-2">{t.reason}.</p>}
            {t.pair.length > 0 && <p className="mt-1 text-[13px] text-muted">Paired with the matching transfer, so it isn&apos;t counted as spending or income.</p>}
            {t.corrections.some((c) => !c.revertedAt) && (
              <button
                onClick={() =>
                  start(async () => {
                    await revertAction(t.id);
                    setSaved("Back to Link's automatic category.");
                    await refresh();
                  })
                }
                className="mt-2 text-[13px] font-medium text-accent-ink"
              >
                Undo my change
              </button>
            )}
          </div>

          <AnimatePresence initial={false}>
            {picking && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 text-[14px]">
                  <span>Use for every {t.merchant} transaction</span>
                  <Checkbox checked={allForMerchant} onCheckedChange={(c) => setAll(c === true)} className="h-5 w-5" />
                </label>
                <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="listbox" aria-label="Choose a category">
                  {PICKABLE.map((c) => (
                    <button
                      key={c}
                      role="option"
                      aria-selected={c === t.category}
                      disabled={pending}
                      onClick={() => choose(c)}
                      className={cn("flex items-center justify-between rounded-sm px-3 py-2.5 text-left text-[13px] transition-colors", c === t.category ? "bg-fg text-bg" : "bg-surface-2 hover:bg-surface-3")}
                    >
                      {categoryLabel(c)}
                      {c === t.category && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {saved && <p className="mt-3 text-[13px] text-accent-ink" role="status">{saved}</p>}

          {!splitting ? (
            <button onClick={() => setSplitting(true)} className="mt-5 text-[13px] font-medium text-fg-2 hover:text-fg">
              {t.hasSplits ? "Edit split" : "Split this transaction"}
            </button>
          ) : (
            <SplitEditor
              total={t.amountMinor}
              initial={t.splits.map((s) => ({ dollars: Math.abs(s.amountMinor) / 100, category: s.category as CategoryId }))}
              fallbackCategory={t.category as CategoryId}
              busy={pending}
              onCancel={() => setSplitting(false)}
              onSave={(parts) =>
                start(async () => {
                  const sign = t.amountMinor < 0 ? -1 : 1;
                  const r = await splitAction(t.id, parts.map((p) => ({ dollars: sign * p.dollars, category: p.category })));
                  if (!r.ok) return setError(r.error);
                  setSplitting(false);
                  setSaved(parts.length ? "Split saved." : "Split removed.");
                  await refresh();
                })
              }
            />
          )}

          <div className="mt-6">
            <label htmlFor="note" className="text-[13px] font-medium">
              Context for Link
            </label>
            <p className="mt-0.5 text-[12px] text-muted">Anything Link should know about this one. It uses this when it answers questions and plans.</p>
            <textarea
              id="note"
              rows={2}
              maxLength={280}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setNoteSaved(false);
              }}
              onBlur={saveNote}
              placeholder="e.g. One-time gift for a friend's wedding"
              className="mt-2 w-full resize-none rounded-sm bg-surface-2 px-4 py-2.5 text-[14px] outline-none placeholder:text-muted focus:ring-2 focus:ring-[var(--focus)]"
            />
            {noteSaved && <p className="mt-1 text-[12px] text-accent-ink" role="status">Saved. Link will keep this in mind.</p>}
          </div>

          <dl className="mt-6 space-y-1.5 text-[13px]">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Bank description</dt>
              <dd className="text-right text-fg-2">{t.name}</dd>
            </div>
            {t.providerDetailed && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Bank category</dt>
                <dd className="text-right text-fg-2">{t.providerDetailed.toLowerCase().replace(/_/g, " ")}</dd>
              </div>
            )}
          </dl>
          {error && <p role="alert" className="mt-3 text-[13px] text-caution">{error}</p>}
        </div>
      )}
    </>
  );
}

function ReviewCallout({ t, busy, onConfirm, onChange }: { t: Detail; busy: boolean; onConfirm: () => void; onChange: () => void }) {
  const p = reviewPrompt(t.reason, t.category, t.kind, t.amountMinor);
  return (
    <div className="mt-6 rounded-md border border-caution/25 bg-caution-soft p-4">
      <p className="text-[12px] font-medium text-caution">Needs a look</p>
      <p className="mt-1 text-[16px] font-semibold tracking-[-0.01em]">{p.ask}</p>
      <p className="mt-0.5 text-[13px] text-fg-2">
        {p.why} {isPaymentRail(t.merchantKey) ? "Your answer applies to this payment only." : `Your answer teaches Link how to handle ${t.merchant} from now on.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" busy={busy} onClick={onConfirm}>
          <Check size={14} /> Yes, that&apos;s right
        </Button>
        <Button size="sm" onClick={onChange} disabled={busy} className="bg-surface hover:bg-surface-2">
          No, change it
        </Button>
      </div>
    </div>
  );
}

function SplitEditor({
  total,
  initial,
  fallbackCategory,
  busy,
  onCancel,
  onSave,
}: {
  total: number;
  initial: { dollars: number; category: CategoryId }[];
  fallbackCategory: CategoryId;
  busy: boolean;
  onCancel: () => void;
  onSave: (parts: { dollars: number; category: CategoryId }[]) => void;
}) {
  const abs = Math.abs(total) / 100;
  const [parts, setParts] = useState(initial.length ? initial : [{ dollars: Math.round(abs * 50) / 100, category: fallbackCategory }, { dollars: Math.round((abs - Math.round(abs * 50) / 100) * 100) / 100, category: "general" as CategoryId }]);
  const sum = Math.round(parts.reduce((s, p) => s + (Number(p.dollars) || 0), 0) * 100) / 100;
  const left = Math.round((abs - sum) * 100) / 100;
  return (
    <div className="mt-5 rounded-md border border-line p-4">
      <p className="text-[13px] font-medium">Split {formatMoney(Math.abs(total), { cents: true })}</p>
      <ul className="mt-3 space-y-2">
        {parts.map((p, i) => (
          <li key={i} className="flex items-center gap-2">
            <Select value={p.category} onValueChange={(v) => setParts((ps) => ps.map((x, j) => (j === i ? { ...x, category: v as CategoryId } : x)))}>
              <SelectTrigger aria-label="Category" className="min-w-0 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PICKABLE.map((c) => (
                  <SelectItem key={c} value={c}>
                    {categoryLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              aria-label="Amount"
              inputMode="decimal"
              value={p.dollars}
              onChange={(e) => setParts((ps) => ps.map((x, j) => (j === i ? { ...x, dollars: e.target.value as unknown as number } : x)))}
              className="h-9 w-24 rounded-full bg-surface-2 px-3 text-right text-[13px] tabular outline-none"
            />
            <button aria-label="Remove part" onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))} className="text-muted hover:text-caution">
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <button onClick={() => setParts((ps) => [...ps, { dollars: Math.max(0, left), category: "general" }])} className="mt-2 inline-flex items-center gap-1 text-[13px] text-fg-2">
        <Plus size={14} /> Add part
      </button>
      <p className={cn("mt-3 text-[12px] tabular", left === 0 ? "text-muted" : "text-caution")}>{left === 0 ? "Adds up." : `${formatMoney(Math.round(left * 100), { cents: true })} ${left > 0 ? "left to assign" : "too much"}`}</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="primary" busy={busy} disabled={left !== 0 || parts.length < 2} onClick={() => onSave(parts.map((p) => ({ dollars: Number(p.dollars), category: p.category })))}>
          Save split
        </Button>
        {initial.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onSave([])} disabled={busy}>
            Remove split
          </Button>
        )}
        <Button size="sm" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
