import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { categoryLabel } from "@/lib/finance/categories";
import { spendingSummary } from "@/lib/finance/budget";
import { formatMoney } from "@/lib/finance/money";
import type { Picture } from "@/lib/finance/plan";
import { cn } from "@/lib/utils";

/**
 * The lead number on Home: what's left in this month's spending plan. Built
 * from categorized spending against the plan on the Plan page, so it answers
 * "how am I doing this month?" in terms the user set, not a cash formula.
 */
export function SpendingHero({ picture }: { picture: Picture }) {
  const { planned, spent, left, daysLeft, perDay, pace, status, hot } = spendingSummary(picture.budget, picture.asOf);
  const month = new Date(`${picture.asOf}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const pct = Math.max(0, Math.min(1, spent / planned));
  const pacePct = Math.max(0, Math.min(1, pace / planned));
  const caution = status !== "on_track";

  return (
    <section className="flex h-full flex-col rounded-lg bg-hero p-6 text-hero-fg md:p-7" aria-labelledby="hero-title">
      <div className="flex items-start justify-between gap-3">
        <p id="hero-title" className="text-[13px] font-medium opacity-70">
          {month} spending plan
        </p>
        <span className={cn("rounded-full px-2.5 py-1 text-[12px] font-medium", caution ? "bg-caution-soft text-caution" : "bg-accent text-accent-fg")}>
          {status === "over_plan" ? "Over plan" : status === "spending_fast" ? "Spending fast" : "On track"}
        </span>
      </div>
      <p className="mt-3 text-[44px] font-semibold leading-none tracking-[-0.045em] tabular sm:text-[56px]">
        {formatMoney(Math.abs(left))}
        <span className="ml-2 text-[20px] font-medium tracking-[-0.02em] opacity-70 sm:text-[22px]">{left < 0 ? "over" : "left"}</span>
      </p>
      <p className="mt-2 text-[15px] opacity-80">
        {formatMoney(spent)} spent of {formatMoney(planned)} · {daysLeft} day{daysLeft === 1 ? "" : "s"} left
        {perDay > 0 && <> · about {formatMoney(perDay)} a day</>}
      </p>

      <div className="relative mt-5 h-2.5 rounded-full bg-hero-fg/15" aria-hidden>
        <div className={cn("absolute inset-y-0 left-0 rounded-full", caution ? "bg-caution" : "bg-accent")} style={{ width: `${pct * 100}%` }} />
        <div className="absolute -top-1 h-[18px] w-0.5 rounded-full bg-hero-fg/70" style={{ left: `${pacePct * 100}%` }} />
      </div>

      {hot.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {hot.map((l) => (
            <li key={l.category} className="rounded-full bg-hero-fg/10 px-2.5 py-1 text-[12px]">
              {categoryLabel(l.category)} · {formatMoney(l.amount)} {l.status === "over" ? "over" : "ahead"}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-6">
        <Link href="/plan#spending" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-hero-fg px-4 text-[13px] font-medium text-hero dark:bg-primary dark:text-primary-fg transition-opacity hover:opacity-90">
          See your spending plan <ArrowRight size={14} />
        </Link>
        <Link href="/activity" className="inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium opacity-80 transition-opacity hover:opacity-100">
          This month&apos;s transactions
        </Link>
      </div>
    </section>
  );
}
