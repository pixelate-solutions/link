"use client";

import { type KeyboardEvent, type PointerEvent, type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Crosshair hover for an SVG line chart drawn in a fixed viewBox. The pointer
 * (or arrow keys) picks the nearest data index; the chart draws the hairline
 * and passes the readout to <Tooltip>.
 */
export function useCrosshair(count: number, xOf: (i: number) => number, width: number) {
  const [index, setIndex] = useState<number | null>(null);
  const nearest = (vx: number) => {
    let best = 0;
    for (let i = 1; i < count; i++) if (Math.abs(xOf(i) - vx) < Math.abs(xOf(best) - vx)) best = i;
    return best;
  };
  const svgProps = {
    tabIndex: 0,
    onPointerMove: (e: PointerEvent<SVGSVGElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setIndex(nearest(((e.clientX - r.left) / r.width) * width));
    },
    onPointerLeave: () => setIndex(null),
    onFocus: () => setIndex((i) => i ?? count - 1),
    onBlur: () => setIndex(null),
    onKeyDown: (e: KeyboardEvent<SVGSVGElement>) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      setIndex((i) => Math.max(0, Math.min(count - 1, (i ?? count - 1) + (e.key === "ArrowRight" ? 1 : -1))));
    },
  };
  return { index, svgProps, leftPct: index == null ? 0 : (xOf(index) / width) * 100 };
}

/** One readout for every series at the hovered X: values lead, labels follow. */
export function Tooltip({ leftPct, title, rows, children }: { leftPct: number; title: string; rows: { label: string; value: string; key?: ReactNode }[]; children?: ReactNode }) {
  const flip = leftPct > 62;
  return (
    <div
      role="status"
      className={cn("pointer-events-none absolute top-1 z-10 w-max max-w-[320px] rounded-sm border border-line bg-surface px-3 py-2 text-[12px] shadow-soft", flip ? "-translate-x-[calc(100%+12px)]" : "translate-x-3")}
      style={{ left: `${leftPct}%` }}
    >
      <p className="text-muted">{title}</p>
      <dl className="mt-1 space-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            {r.key}
            <dd className="whitespace-nowrap text-[13px] font-semibold tabular text-fg">{r.value}</dd>
            <dt className="text-muted">{r.label}</dt>
          </div>
        ))}
      </dl>
      {children}
    </div>
  );
}

/** Short stroke in the series' style, for tooltip rows. */
export function LineKey({ className }: { className: string }) {
  return <span className={cn("inline-block w-3 shrink-0", className)} aria-hidden />;
}
