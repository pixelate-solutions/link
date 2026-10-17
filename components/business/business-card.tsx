import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card, Eyebrow } from "@/components/home/card";
import type { BusinessView } from "@/lib/finance/business";
import { categoryLabel } from "@/lib/finance/categories";
import { formatMoney } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

function runwayText(b: BusinessView) {
  if (b.runwayMonths == null) return null;
  return b.burning ? `${b.runwayMonths.toFixed(1)} months of cash at the current pace` : `Cash covers ${b.runwayMonths.toFixed(1)} months of expenses`;
}

function monthLabel(m: string) {
  return new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

/** Compact: how the business is doing, at a glance. */
export function BusinessSummaryCard({ b }: { b: BusinessView }) {
  return (
    <Link href="/plan#business" className="group block">
      <Card className="h-full transition-colors group-hover:bg-surface/80">
        <div className="flex items-start justify-between">
          <Eyebrow>{b.name}</Eyebrow>
          <ArrowRight size={16} className="text-muted transition-transform group-hover:translate-x-0.5" />
        </div>
        {b.monthsAnalyzed ? (
          <>
            <p className={cn("mt-2 text-[22px] font-semibold tracking-[-0.02em] tabular", b.profit < 0 && "text-caution")}>
              {formatMoney(b.profit)} <span className="text-[15px] font-normal text-muted">profit a month</span>
            </p>
            <p className="mt-2 text-[13px] text-muted">
              {formatMoney(b.thisMonth.profit)} so far this month{runwayText(b) ? ` · ${runwayText(b)}` : ""}
            </p>
          </>
        ) : (
          <p className="mt-2 text-[14px] text-fg-2">Link needs a full month of history to show this business&apos;s trend.</p>
        )}
      </Card>
    </Link>
  );
}

/** How Link treats each structure, in one line the owner can check. */
const STRUCTURE_NOTE: Record<string, string> = {
  sole_prop: "Sole proprietorship: the business is you. Its profit is your income for taxes whether or not you move it to personal accounts.",
  llc: "LLC: taxed as a pass-through, so your share of profit is taxed on your personal return whether or not you draw it.",
  s_corp: "S corp: your salary comes through payroll with taxes withheld; profit beyond it passes through to your personal return.",
  partnership: "Partnership: only your ownership share of profit is yours, and it's taxed on your personal return.",
  other: "Taxed on its own: Link counts only what you take out as personal income.",
};

/** Detailed: the business on its own terms. */
export function BusinessDetailCard({ b }: { b: BusinessView }) {
  const max = Math.max(1, ...b.months.map((m) => Math.abs(m.profit)));
  return (
    <Card id="business">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{b.name}</h2>
        <span className="text-[12px] text-muted">
          {b.ownershipPct < 100 ? `You own ${b.ownershipPct}%` : "Yours"} · {b.monthsAnalyzed} months analyzed
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[14px] md:grid-cols-4">
        {[
          ["Revenue", b.revenue],
          ["Expenses", b.expenses],
          [b.ownershipPct < 100 ? `Profit (your ${b.ownershipPct}%)` : "Profit", b.ownershipPct < 100 ? b.ownerProfit : b.profit],
          ["You take out", b.draws],
        ].map(([label, v]) => (
          <div key={label as string}>
            <dt className="text-muted">{label} / mo</dt>
            <dd className={cn("mt-0.5 text-[17px] font-medium tabular", (label as string).startsWith("Profit") && (v as number) < 0 && "text-caution")}>{formatMoney(v as number)}</dd>
          </div>
        ))}
      </dl>

      {b.months.length > 0 && (
        <figure className="mt-6" aria-label="Profit by month">
          <div className="flex h-24 items-end gap-2">
            {b.months.map((m) => (
              <div key={m.month} className="flex h-full flex-1 flex-col justify-end" title={`${monthLabel(m.month)}: ${formatMoney(m.profit)} profit`}>
                <div className={cn("rounded-t-[4px]", m.profit >= 0 ? "bg-accent" : "bg-caution")} style={{ height: `${Math.max(3, (Math.abs(m.profit) / max) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-2 text-[11px] text-muted">
            {b.months.map((m) => (
              <span key={m.month} className="flex-1 text-center">
                {monthLabel(m.month)}
              </span>
            ))}
          </div>
        </figure>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {b.topExpenses.length > 0 && (
          <div>
            <p className="text-[13px] font-medium text-muted">Where the money goes</p>
            <ul className="mt-2 space-y-1.5 text-[14px]">
              {b.topExpenses.map((e) => (
                <li key={e.category} className="flex justify-between gap-3">
                  <span className="text-fg-2">{categoryLabel(e.category)}</span>
                  <span className="tabular">{formatMoney(e.monthly)}/mo</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {b.recurringCosts.length > 0 && (
          <div>
            <p className="text-[13px] font-medium text-muted">Recurring costs</p>
            <ul className="mt-2 space-y-1.5 text-[14px]">
              {b.recurringCosts.slice(0, 6).map((r) => (
                <li key={r.merchant} className="flex justify-between gap-3">
                  <span className="text-fg-2">{r.merchant}</span>
                  <span className="tabular">{formatMoney(r.monthly)}/mo</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ul className="mt-6 space-y-1 text-[13px] text-fg-2">
        <li>
          Cash {formatMoney(b.cash)}
          {b.debt > 0 && <> · owes {formatMoney(b.debt)}</>}
          {runwayText(b) && <> · {runwayText(b)}</>}
        </li>
        {b.taxSetAsideMonthly > 0 && (
          <li>
            Estimated taxes: about {formatMoney(b.taxSetAsideMonthly)} a month ({b.taxSetAsidePct}% of your share of profit; change the rate in Account).
            {b.personalTaxMonthly > 0 && <> {formatMoney(b.personalTaxMonthly)} of it falls on your personal money because you draw the profit out, so your plan sets that aside.</>}
          </li>
        )}
        <li className="text-muted">{STRUCTURE_NOTE[b.structure] ?? STRUCTURE_NOTE.other}</li>
        <li className="text-muted">
          Counted in your net worth at your share ({formatMoney(b.ownerShare)}).{" "}
          {b.structure === "sole_prop"
            ? "As a sole proprietorship, its cash and the profit you leave in it count toward your goals."
            : b.countTowardGoals
              ? "Its cash, and the profit you leave in it, count toward your goals."
              : "Its cash isn't counted toward your goals unless you turn that on."}
        </li>
      </ul>
    </Card>
  );
}
