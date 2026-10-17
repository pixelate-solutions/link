"use client";

import { useState } from "react";
import { category } from "@/lib/finance/categories";
import { cn } from "@/lib/utils";

const GROUP_TONE: Record<string, string> = {
  income: "bg-accent",
  essential: "bg-fg-2",
  discretionary: "bg-[oklch(0.7_0.12_250)]",
  transfer: "bg-surface-3",
  savings: "bg-[oklch(0.72_0.12_200)]",
  business: "bg-[oklch(0.72_0.13_75)]",
};

/** The merchant's logo when the bank provides one, otherwise its initial; the dot shows the category group. */
export function MerchantMark({ name, cat, logo, className }: { name: string; cat: string; logo?: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  const g = category(cat).group;
  return (
    <span className={cn("relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-[14px] font-semibold text-fg-2", className)} aria-hidden>
      {logo && !broken ? (
        // Plaid's logo CDN; plain <img> so no image optimizer is needed for third-party hosts.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-full w-full rounded-full bg-white object-cover" />
      ) : (
        name.trim().charAt(0).toUpperCase() || "·"
      )}
      <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface", GROUP_TONE[g])} />
    </span>
  );
}
