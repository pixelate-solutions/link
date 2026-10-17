import { cn } from "@/lib/utils";

/** Link's mark: an "L" path completing toward a point, the goal. */
export function Logo({ className, withWord = true }: { className?: string; withWord?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-fg", className)}>
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden>
        <path d="M7 4v10.5A3.5 3.5 0 0 0 10.5 18H17" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="17.5" cy="5.5" r="2.4" className="fill-accent" />
      </svg>
      {withWord && <span className="text-[17px] font-semibold tracking-[-0.03em]">link</span>}
    </span>
  );
}
