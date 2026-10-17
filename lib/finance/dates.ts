/** Calendar dates are ISO strings (YYYY-MM-DD) in the user's local calendar; no time zone math. */
export type ISODate = string;

const DAY = 86_400_000;

export function parseDate(d: ISODate): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y!, m! - 1, day!);
}

export function formatDate(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return formatDate(parseDate(d) + n * DAY);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseDate(b) - parseDate(a)) / DAY);
}

export function addMonths(d: ISODate, n: number, anchorDay?: number): ISODate {
  const [y, m, day] = d.split("-").map(Number);
  const target = new Date(Date.UTC(y!, m! - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(anchorDay ?? day!, lastDay));
  return formatDate(target.getTime());
}

export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

export function startOfMonth(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}

export function daysInMonth(d: ISODate): number {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

/** The `count` most recent complete calendar months before `asOf`'s month, oldest first. */
export function completeMonthsBefore(asOf: ISODate, count: number): string[] {
  const out: string[] = [];
  for (let i = count; i >= 1; i--) out.push(monthKey(addMonths(startOfMonth(asOf), -i, 1)));
  return out;
}

export function todayISO(timeZone = "UTC", now = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const DAYS_PER_MONTH = 365.25 / 12;
