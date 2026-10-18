"use client";

import { useState } from "react";
import { Tooltip } from "@/components/plan/chart-hover";
import type { BusinessView } from "@/lib/finance/business";
import { formatMoney } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

function monthLabel(m: string, long = false) {
  const label = new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: long ? "long" : "short", timeZone: "UTC" });
  if (long) return `${label} ${m.slice(0, 4)}`;
  return m.slice(0, 4) === String(new Date().getFullYear()) ? label : `${label} '${m.slice(2, 4)}`;
}

/** Profit by month. Each bar is its own hover/focus target with the month's figures. */
export function ProfitBars({ months }: { months: BusinessView["months"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...months.map((m) => Math.abs(m.profit)));
  const m = hover == null ? null : months[hover]!;
  return (
    <figure className="relative mt-6" aria-label="Profit by month" onPointerLeave={() => setHover(null)}>
      <div className="flex h-24 items-end gap-2">
        {months.map((mo, i) => (
          <button
            key={mo.month}
            type="button"
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-label={`${monthLabel(mo.month, true)}: ${formatMoney(mo.profit)} profit`}
            className="group flex h-full flex-1 cursor-default flex-col justify-end outline-none"
          >
            <span
              className={cn("block rounded-t-[4px] transition-opacity", mo.profit >= 0 ? "bg-accent" : "bg-caution", hover != null && hover !== i && "opacity-50")}
              style={{ height: `${Math.max(3, (Math.abs(mo.profit) / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2 text-[11px] text-muted">
        {months.map((mo) => (
          <span key={mo.month} className="flex-1 text-center">
            {monthLabel(mo.month)}
          </span>
        ))}
      </div>
      {m && (
        <Tooltip
          leftPct={((hover! + 0.5) / months.length) * 100}
          title={monthLabel(m.month, true)}
          rows={[
            { label: "profit", value: formatMoney(m.profit) },
            { label: "revenue", value: formatMoney(m.revenue) },
            { label: "expenses", value: formatMoney(m.expenses) },
            { label: "you took out", value: formatMoney(m.draws) },
          ]}
        />
      )}
    </figure>
  );
}
