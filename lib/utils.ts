import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function relativeTime(iso: string | Date | null | undefined, now = new Date()): string {
  if (!iso) return "never";
  const t = typeof iso === "string" ? new Date(iso) : iso;
  const mins = Math.round((now.getTime() - t.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

/** "Oct 4", or "Oct 4, 2025" when the date isn't in the current year. Pass `year` in opts to decide yourself. */
export function shortDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }, now = new Date()) {
  const otherYear = opts.year === undefined && iso.slice(0, 4) !== String(now.getFullYear());
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, ...(otherYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}
