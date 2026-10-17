import { daysBetween } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import type { Picture } from "@/lib/finance/plan";
import { cn, shortDate } from "@/lib/utils";
import { MerchantMark } from "@/components/activity/category-dot";
import { Card, Eyebrow } from "./card";

export function ComingUp({ picture, logos }: { picture: Picture; logos: Record<string, string> }) {
  const events = picture.forecast.events.filter((e) => daysBetween(picture.asOf, e.date) <= 14 && e.kind !== "transfer").slice(0, 6);
  if (!events.length) return null;
  return (
    <Card className="h-full">
      <Eyebrow>Coming up in the next two weeks</Eyebrow>
      <ul className="mt-3 space-y-3">
        {events.map((e, i) => (
          <li key={`${e.date}-${e.label}-${i}`} className="flex items-center gap-3 text-[14px]">
            <MerchantMark name={e.label} cat={e.amount > 0 ? "paycheck" : "utilities"} logo={logos[e.label.toLowerCase()]} className="h-8 w-8 text-[12px]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-fg">{e.label}</span>
              <span className="block text-[12px] text-muted tabular">
                {shortDate(e.date)}
                {!e.confirmed && " · predicted"}
              </span>
            </span>
            <span className={cn("tabular", e.amount > 0 && "text-accent-ink")}>{formatMoney(e.amount, { signed: e.amount > 0 })}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
