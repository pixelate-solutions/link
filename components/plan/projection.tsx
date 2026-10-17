"use client";

import { motion } from "motion/react";
import { Slider } from "@/components/ui/slider";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { answerFactAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { projectFi, SCENARIOS, trajectory } from "@/lib/finance/fi";
import { formatMoney } from "@/lib/finance/money";
import { fiInputs, type GoalView, type PlanInputs } from "@/lib/finance/plan";
import { cn } from "@/lib/utils";
import { LineKey, Tooltip, useCrosshair } from "./chart-hover";

const W = 640;
const H = 240;
const PAD = { l: 8, r: 8, t: 12, b: 26 };

function path(points: { x: number; y: number }[]) {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

function rangeText(w: NonNullable<GoalView["fi"]>["window"], age: number | null) {
  if (!w) return "Beyond 60 years";
  if (age != null && w.fromAge != null && w.toAge != null) {
    const a = Math.round(w.fromAge);
    const b = Math.round(w.toAge);
    return a === b ? `Age ${a}` : `Age ${a}–${b}`;
  }
  const a = Math.round(w.fromYears);
  const b = Math.round(w.toYears);
  return a === b ? `In ${a} years` : `In ${a}–${b} years`;
}

/**
 * Financial-independence projection you can push on. Recomputed in the
 * browser with the same engine the server uses; nothing is saved until you ask.
 */
export function Projection({ goal, inputs }: { goal: GoalView; inputs: PlanInputs }) {
  const base = useMemo(() => fiInputs(inputs), [inputs]);
  const maxExtra = Math.max(2000_00, Math.ceil((inputs.cashRetainedMonthly * 1.2) / 100_00) * 100_00);
  const [extra, setExtra] = useState(0);
  const [spend, setSpend] = useState(base.annualSpending);
  const dExtra = useDeferredValue(extra);
  const dSpend = useDeferredValue(spend);
  const [saving, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const adjusted = useMemo(() => ({ ...fiInputs(inputs, dExtra), annualSpending: dSpend }), [inputs, dExtra, dSpend]);
  const proj = useMemo(() => projectFi(adjusted, { paths: 300, sensitivity: false }), [adjusted]);
  const years = Math.min(60, Math.max(20, Math.ceil((proj.scenarios[0]!.years ?? 45) + 5)));
  const lines = useMemo(() => SCENARIOS.map((a) => trajectory(adjusted, a, years)), [adjusted, years]);

  const maxV = Math.max(...lines[2]!.map((p) => p.value), lines[1]![0]!.required * 1.15, 1);
  const x = (yr: number) => PAD.l + (yr / years) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (Math.min(v, maxV) / maxV) * (H - PAD.t - PAD.b);
  const pts = lines.map((l) => l.map((p) => ({ x: x(p.year), y: y(p.value) })));
  const band = `${path(pts[2]!)} L${[...pts[0]!].reverse().map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L")} Z`;
  const required = lines[1]!.map((p) => ({ x: x(p.year), y: y(p.required) }));
  const w = proj.window;
  const age0 = inputs.age;
  const label = (yr: number) => (age0 != null ? `${Math.round(age0 + yr)}` : yr === 0 ? "now" : `+${yr}y`);
  const changed = dExtra !== 0 || dSpend !== base.annualSpending;
  const hover = useCrosshair(lines[1]!.length, (i) => x(lines[1]![i]!.year), W);
  const hi = hover.index;
  const at = hi == null ? null : { base: lines[1]![hi]!, low: lines[0]![hi]!, high: lines[2]![hi]! };
  const calendarYear = (yr: number) => Number(inputs.asOf.slice(0, 4)) + yr;

  return (
    <div>
      <p className="text-[13px] font-medium text-muted">{goal.title}</p>
      <motion.p key={rangeText(w, age0)} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="mt-1 text-[40px] font-semibold leading-none tracking-[-0.04em] sm:text-display">
        {rangeText(w, age0)}
      </motion.p>
      <p className="mt-2 text-[14px] text-fg-2">
        {changed ? <>With these changes, compared with {goal.headline.toLowerCase()} today.</> : goal.detail}
      </p>

      <figure className="relative mt-6">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full cursor-crosshair touch-none overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          role="img"
          aria-label={`Projected investments over ${years} years under conservative, base and optimistic returns, against the amount needed. Use the arrow keys to read values.`}
          {...hover.svgProps}
        >
          {w && (
            <motion.rect
              initial={false}
              animate={{ x: x(w.fromYears), width: Math.max(2, x(w.toYears) - x(w.fromYears)) }}
              y={PAD.t}
              height={H - PAD.t - PAD.b}
              rx={6}
              className="fill-accent/15"
            />
          )}
          <motion.path initial={false} animate={{ d: band }} className="fill-fg/[0.06]" />
          <motion.path initial={false} animate={{ d: path(required) }} fill="none" strokeDasharray="3 4" strokeWidth={1.5} className="stroke-muted" />
          <motion.path initial={false} animate={{ d: path(pts[0]!) }} fill="none" strokeWidth={1.25} className="stroke-muted/60" />
          <motion.path initial={false} animate={{ d: path(pts[2]!) }} fill="none" strokeWidth={1.25} className="stroke-muted/60" />
          <motion.path initial={false} animate={{ d: path(pts[1]!) }} fill="none" strokeWidth={2.5} strokeLinecap="round" className="stroke-fg" />
          {at && (
            <g aria-hidden>
              <line x1={x(at.base.year)} x2={x(at.base.year)} y1={PAD.t} y2={H - PAD.b} className="stroke-muted/60" strokeWidth={1} />
              <circle cx={x(at.base.year)} cy={y(at.base.required)} r={3.5} strokeWidth={2} className="fill-muted stroke-surface" />
              <circle cx={x(at.base.year)} cy={y(at.base.value)} r={4.5} strokeWidth={2} className="fill-fg stroke-surface" />
            </g>
          )}
          <rect x={0} y={0} width={W} height={H} fill="transparent" />
        </svg>
        {at && (
          <Tooltip
            leftPct={hover.leftPct}
            title={`${at.base.year === 0 ? "Today" : age0 != null ? `Age ${Math.round(age0 + at.base.year)}` : `In ${at.base.year} year${at.base.year === 1 ? "" : "s"}`} · ${calendarYear(at.base.year)}`}
            rows={[
              { label: "expected", value: formatMoney(at.base.value, { compact: at.base.value >= 1_000_000_00 }), key: <LineKey className="h-0.5 rounded-full bg-fg" /> },
              {
                label: "conservative – optimistic",
                value: `${formatMoney(at.low.value, { compact: true })} – ${formatMoney(at.high.value, { compact: true })}`,
                key: <LineKey className="h-2 rounded-[2px] bg-fg/15" />,
              },
              { label: "enough to stop working", value: formatMoney(at.base.required, { compact: at.base.required >= 1_000_000_00 }), key: <LineKey className="border-t border-dashed border-muted" /> },
            ]}
          >
            <p className="mt-1 text-[11px] text-muted">
              {at.base.value >= at.base.required ? "On the expected path, you'd have enough by here." : `${formatMoney(at.base.required - at.base.value, { compact: true })} short on the expected path.`} In today&apos;s dollars.
            </p>
          </Tooltip>
        )}
        <div className="-mt-4 flex justify-between text-[11px] text-muted tabular" aria-hidden>
          <span>{label(0)}</span>
          <span>{label(Math.round(years / 2))}</span>
          <span>{label(years)}</span>
        </div>
        <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-fg" /> Expected</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-fg/10" /> Conservative to optimistic</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-muted" /> Enough to stop working</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-accent/20" /> Likely window</span>
        </figcaption>
      </figure>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Control label="Invest more each month" value={formatMoney(extra)} min={0} max={maxExtra} step={50_00} v={extra} onChange={setExtra} />
        <Control
          label="Spending in retirement"
          value={`${formatMoney(spend, { compact: spend >= 100_000_00 })}/yr`}
          min={Math.round(base.annualSpending * 0.5 / 1000_00) * 1000_00}
          max={Math.round(base.annualSpending * 1.6 / 1000_00) * 1000_00}
          step={1000_00}
          v={spend}
          onChange={setSpend}
        />
      </div>
      {changed && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => { setExtra(0); setSpend(base.annualSpending); setSaved(false); }}>
            Reset
          </Button>
          {dSpend !== base.annualSpending && (
            <Button
              size="sm"
              variant="primary"
              busy={saving}
              onClick={() => start(async () => { const r = await answerFactAction("retirement_spending_annual", Math.round(spend / 100)); setSaved(r.ok); })}
            >
              Use {formatMoney(spend)}/yr as my retirement spending
            </Button>
          )}
          {saved && <span className="text-[13px] text-accent-ink">Saved to your plan.</span>}
          {dExtra > 0 && <span className="text-[13px] text-muted">Investing more is up to you; Link can&apos;t move money.</span>}
        </div>
      )}
      {proj.successAtBase != null && (
        <p className={cn("mt-5 text-[13px]", proj.successAtBase < 0.8 ? "text-caution" : "text-muted")}>
          Retiring at the expected point, your money lasts {proj.successAtBase >= 0.995 ? "in nearly every" : `in ${Math.round(proj.successAtBase * 100)}% of`} simulated markets{age0 != null ? " to age 95" : ""}.
        </p>
      )}
    </div>
  );
}

function Control({ label, value, min, max, step, v, onChange }: { label: string; value: string; min: number; max: number; step: number; v: number; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-fg-2">{label}</span>
        <span className="text-[15px] font-medium tabular">{value}</span>
      </div>
      <Slider className="mt-2" rangeClassName="bg-fg/70" min={min} max={max} step={step} value={[v]} onValueChange={([n]) => onChange(n!)} aria-label={label} />
    </div>
  );
}
