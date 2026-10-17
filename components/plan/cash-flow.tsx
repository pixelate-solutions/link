import { formatMoney } from "@/lib/finance/money";
import type { Picture } from "@/lib/finance/plan";
import { shortDate } from "@/lib/utils";

const W = 640;
const H = 140;

/** 90-day projected checking balance with an ~80% range. Server-rendered SVG. */
export function CashFlow({ forecast }: { forecast: Picture["forecast"] }) {
  const pts = forecast.points;
  if (pts.length < 2) return null;
  const min = Math.min(0, ...pts.map((p) => p.low));
  const max = Math.max(...pts.map((p) => p.high));
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => H - 18 - ((v - min) / (max - min || 1)) * (H - 28);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.expected).toFixed(1)}`).join(" ");
  const band = `${pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.high).toFixed(1)}`).join(" ")} ${[...pts].reverse().map((p, i) => `L${x(pts.length - 1 - i).toFixed(1)},${y(p.low).toFixed(1)}`).join(" ")} Z`;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Checking balance projected over ${forecast.days} days; lowest ${formatMoney(forecast.lowest.expected)} on ${shortDate(forecast.lowest.date)}.`}>
        {min < 0 && <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="stroke-caution/60" strokeDasharray="3 4" />}
        <path d={band} className="fill-fg/[0.06]" />
        <path d={line} fill="none" strokeWidth={2} className="stroke-fg" />
        <text x={0} y={H - 2} className="fill-muted text-[11px]">{shortDate(pts[0]!.date)}</text>
        <text x={W} y={H - 2} textAnchor="end" className="fill-muted text-[11px]">{shortDate(pts.at(-1)!.date)}</text>
      </svg>
      <figcaption className="mt-2 text-[13px] text-fg-2">
        Lowest point about <span className="tabular">{formatMoney(forecast.lowest.expected)}</span> on {shortDate(forecast.lowest.date)}
        {forecast.shortfall ? <span className="text-caution">; could dip below zero around {shortDate(forecast.shortfall.date)}</span> : ""}. Shaded range covers most likely outcomes.
      </figcaption>
    </figure>
  );
}
