import Link from "next/link";
import { daysBetween } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import type { Picture } from "@/lib/finance/plan";
import { shortDate } from "@/lib/utils";
import { Card, Eyebrow } from "./card";

export function ComingUp({ picture }: { picture: Picture }) {
  const events = picture.forecast.events.filter((e) => daysBetween(picture.asOf, e.date) <= 14 && e.kind !== "transfer").slice(0, 5);
  if (!events.length) return null;
  return (
    <Card>
      <Eyebrow>Coming up</Eyebrow>
      <ul className="mt-3 space-y-2.5">
        {events.map((e, i) => (
          <li key={`${e.date}-${e.label}-${i}`} className="flex items-baseline justify-between gap-3 text-[14px]">
            <span className="min-w-0 truncate">
              <span className="text-muted tabular">{shortDate(e.date)}</span>
              <span className="ml-3 text-fg">{e.label}</span>
              {!e.confirmed && <span className="sr-only"> (predicted)</span>}
            </span>
            <span className={e.amount > 0 ? "tabular text-accent-ink" : "tabular"}>{formatMoney(e.amount, { signed: e.amount > 0 })}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-muted">Predicted from your history.</p>
    </Card>
  );
}

export function ThisMonth({ picture }: { picture: Picture }) {
  const typical = picture.baseline.spending;
  const spent = picture.budget.spentThisMonth;
  const expected = picture.budget.typicalByNow;
  if (!typical) return null;
  const pct = Math.min(1, spent / typical);
  const pace = Math.min(1, expected / typical);
  const ahead = spent > expected * 1.1 + 50_00;
  const behind = spent < expected * 0.9 - 50_00;
  return (
    <Link href="/activity" className="block">
      <Card className="h-full transition-colors hover:bg-surface/80">
        <Eyebrow>This month</Eyebrow>
        <p className="mt-2 text-[22px] font-semibold tracking-[-0.02em] tabular">
          {formatMoney(spent)} <span className="text-[15px] font-normal text-muted">of about {formatMoney(typical)}</span>
        </p>
        <div className="relative mt-4 h-2 rounded-full bg-surface-2" aria-hidden>
          <div className="absolute inset-y-0 left-0 rounded-full bg-fg/80" style={{ width: `${pct * 100}%` }} />
          <div className="absolute -top-1 h-4 w-0.5 rounded-full bg-muted" style={{ left: `${pace * 100}%` }} title="Where a typical month is by today" />
        </div>
        <p className="mt-3 text-[13px] text-muted">{ahead ? `${formatMoney(spent - expected)} more than usual by this point.` : behind ? `${formatMoney(expected - spent)} less than usual by this point.` : "About the same as usual by this point."}</p>
      </Card>
    </Link>
  );
}

export function Learned({ picture }: { picture: Picture }) {
  const income = picture.recurring.filter((r) => r.kind === "income" && r.category === "paycheck");
  const bills = picture.recurring.filter((r) => r.kind === "bill" || r.kind === "subscription");
  const billsMonthly = bills.reduce((s, b) => s + Math.abs(b.amount) * (b.cadence === "weekly" ? 52 / 12 : b.cadence === "biweekly" ? 26 / 12 : b.cadence === "semimonthly" ? 2 : b.cadence === "annual" ? 1 / 12 : b.cadence === "quarterly" ? 1 / 3 : 1), 0);
  const lines = [
    picture.baseline.income > 0 && `Income of about ${formatMoney(picture.baseline.income)} a month${income.length > 1 ? ` from ${income.length} sources` : ""}.`,
    bills.length > 0 && `${bills.length} regular bills and subscriptions, about ${formatMoney(Math.round(billsMonthly))} a month.`,
    picture.baseline.savingsRate != null && `You keep about ${Math.round(picture.baseline.savingsRate * 100)}% of what you earn.`,
    `${picture.coverage.transactions.toLocaleString("en-US")} transactions sorted automatically${picture.coverage.reviewCount ? `; ${picture.coverage.reviewCount} could use a quick look` : ""}.`,
  ].filter(Boolean) as string[];
  return (
    <Card>
      <Eyebrow>What Link learned</Eyebrow>
      <ul className="mt-3 space-y-2 text-[15px]">
        {lines.map((l) => (
          <li key={l} className="flex gap-2.5">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            {l}
          </li>
        ))}
      </ul>
      {picture.coverage.reviewCount > 0 && (
        <Link href="/activity?filter=review" className="mt-4 inline-block text-[13px] font-medium text-accent-ink hover:underline">
          Review {picture.coverage.reviewCount}
        </Link>
      )}
    </Card>
  );
}
