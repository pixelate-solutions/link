import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card, Eyebrow } from "@/components/home/card";
import type { BusinessView } from "@/lib/finance/business";
import { categoryLabel } from "@/lib/finance/categories";
import { formatMoney } from "@/lib/finance/money";
import { cn } from "@/lib/utils";
import { ProfitBars } from "./profit-bars";

function runwayText(b: BusinessView) {
  if (b.runwayMonths == null) return null;
  return b.burning ? `${b.runwayMonths.toFixed(1)} months of cash at the current pace` : `Cash covers ${b.runwayMonths.toFixed(1)} months of expenses`;
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

/** Detailed: the business on its own terms. */
export function BusinessDetailCard({ b }: { b: BusinessView }) {
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
        <ProfitBars months={b.months} />
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
            Estimated taxes {formatMoney(b.taxSetAsideMonthly)}/mo
            {b.personalTaxMonthly > 0 && <> · {formatMoney(b.personalTaxMonthly)}/mo from personal</>}
          </li>
        )}
      </ul>
    </Card>
  );
}
