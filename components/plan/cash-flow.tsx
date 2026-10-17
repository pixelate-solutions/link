"use client";

import { formatMoney } from "@/lib/finance/money";
import type { Picture } from "@/lib/finance/plan";
import { shortDate } from "@/lib/utils";
import { LineKey, Tooltip, useCrosshair } from "./chart-hover";

const W = 640;
const H = 140;

/** 90-day projected checking balance with an ~80% range. Hover or arrow keys for values. */
export function CashFlow({ forecast }: { forecast: Picture["forecast"] }) {
  const pts = forecast.points;
  const x = (i: number) => (i / Math.max(1, pts.length - 1)) * W;
  const hover = useCrosshair(pts.length, x, W);
  if (pts.length < 2) return null;
  const min = Math.min(0, ...pts.map((p) => p.low));
  const max = Math.max(...pts.map((p) => p.high));
  const y = (v: number) => H - 18 - ((v - min) / (max - min || 1)) * (H - 28);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.expected).toFixed(1)}`).join(" ");
  const band = `${pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.high).toFixed(1)}`).join(" ")} ${[...pts].reverse().map((p, i) => `L${x(pts.length - 1 - i).toFixed(1)},${y(p.low).toFixed(1)}`).join(" ")} Z`;
  const i = hover.index;
  const p = i == null ? null : pts[i]!;
  // Points are a few days apart: list what's expected since the previous one.
  const events = p ? forecast.events.filter((e) => e.date <= p.date && (i === 0 || e.date > pts[i! - 1]!.date) && e.kind !== "transfer").slice(0, 4) : [];
  return (
    <figure>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full cursor-crosshair touch-none overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          role="img"
          aria-label={`Checking balance projected over ${forecast.days} days; lowest ${formatMoney(forecast.lowest.expected)} on ${shortDate(forecast.lowest.date)}. Use the arrow keys to read values.`}
          {...hover.svgProps}
        >
          {min < 0 && <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-caution/60" strokeDasharray="3 4" />}
          <path d={band} className="fill-fg/[0.06]" />
          <path d={line} fill="none" strokeWidth={2} className="stroke-fg" />
          {p && (
            <g aria-hidden>
              <line x1={x(i!)} x2={x(i!)} y1={0} y2={H - 18} className="stroke-muted/60" strokeWidth={1} />
              <circle cx={x(i!)} cy={y(p.expected)} r={4.5} strokeWidth={2} className="fill-fg stroke-surface" />
            </g>
          )}
          <rect x={0} y={0} width={W} height={H} fill="transparent" />
        </svg>
        {p && (
          <Tooltip
            leftPct={hover.leftPct}
            title={shortDate(p.date, { weekday: "short", month: "short", day: "numeric" })}
            rows={[
              { label: "expected balance", value: formatMoney(p.expected), key: <LineKey className="h-0.5 rounded-full bg-fg" /> },
              { label: "likely range", value: `${formatMoney(p.low)} – ${formatMoney(p.high)}`, key: <LineKey className="h-2 rounded-[2px] bg-fg/15" /> },
            ]}
          >
            {events.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 border-t border-line pt-1.5">
                {events.map((e, k) => (
                  <li key={k} className="flex justify-between gap-3">
                    <span className="truncate text-fg-2">{e.label}</span>
                    <span className={e.amount > 0 ? "tabular text-accent-ink" : "tabular"}>{formatMoney(e.amount, { signed: e.amount > 0 })}</span>
                  </li>
                ))}
              </ul>
            )}
          </Tooltip>
        )}
      </div>
      <div className="-mt-3 flex justify-between text-[11px] text-muted" aria-hidden>
        <span>{shortDate(pts[0]!.date)}</span>
        <span>{shortDate(pts.at(-1)!.date)}</span>
      </div>
      <figcaption className="mt-2 text-[13px] text-fg-2">
        Lowest point about <span className="tabular">{formatMoney(forecast.lowest.expected)}</span> on {shortDate(forecast.lowest.date)}
        {forecast.shortfall ? <span className="text-caution">; could dip below zero around {shortDate(forecast.shortfall.date)}</span> : ""}. Shaded range covers most likely outcomes. Hover the chart for any day.
      </figcaption>
    </figure>
  );
}
