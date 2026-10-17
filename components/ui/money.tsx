import { formatMoney } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

export function Money({ value, cents, signed, compact, tone, className }: { value: number; cents?: boolean; signed?: boolean; compact?: boolean; tone?: "auto" | "none"; className?: string }) {
  const positive = tone === "auto" && value > 0;
  return <span className={cn("tabular", positive && "text-accent-ink", className)}>{formatMoney(value, { cents, signed, compact })}</span>;
}
