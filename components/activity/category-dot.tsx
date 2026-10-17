import { category } from "@/lib/finance/categories";
import { cn } from "@/lib/utils";

const GROUP_TONE: Record<string, string> = {
  income: "bg-accent",
  essential: "bg-fg-2",
  discretionary: "bg-[oklch(0.7_0.12_250)]",
  transfer: "bg-surface-3",
  savings: "bg-[oklch(0.72_0.12_200)]",
};

export function MerchantMark({ name, cat, className }: { name: string; cat: string; className?: string }) {
  const g = category(cat).group;
  return (
    <span className={cn("relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-[14px] font-semibold text-fg-2", className)} aria-hidden>
      {name.trim().charAt(0).toUpperCase() || "·"}
      <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface", GROUP_TONE[g])} />
    </span>
  );
}
