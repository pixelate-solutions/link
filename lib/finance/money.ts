/**
 * Money is always an integer number of minor units (cents for USD).
 *
 * Sign convention, everywhere in Link: positive = money flowing INTO the
 * user's account (deposits, refunds, payments received), negative = money
 * flowing OUT (purchases, bills). Plaid uses the opposite convention; the
 * ingestion layer flips it exactly once.
 *
 * Integers in JS are exact up to 2^53, i.e. ~$90 trillion in cents.
 */
export type Minor = number;

export function assertMinor(value: number, label = "amount"): Minor {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be an integer number of minor units, got ${value}`);
  }
  return value;
}

/** Convert a provider decimal amount (e.g. 12.34) to minor units without float drift. */
export function toMinor(value: number | string, fractionDigits = 2): Minor {
  const str = typeof value === "number" ? value.toFixed(fractionDigits + 2) : value.trim();
  if (!/^[-+]?\d*(\.\d+)?$/.test(str) || str === "" || str === "-" || str === "+") {
    throw new Error(`Invalid money value: ${value}`);
  }
  const negative = str.startsWith("-");
  const unsigned = str.replace(/^[-+]/, "");
  const [whole = "0", frac = ""] = unsigned.split(".");
  const padded = (frac + "0".repeat(fractionDigits + 1)).slice(0, fractionDigits + 1);
  // Round half away from zero on the first dropped digit.
  let minor = Number(whole || "0") * 10 ** fractionDigits + Number(padded.slice(0, fractionDigits) || "0");
  if (Number(padded[fractionDigits]) >= 5) minor += 1;
  return negative ? -minor : minor;
}

export function fromMinor(minor: Minor, fractionDigits = 2): number {
  return minor / 10 ** fractionDigits;
}

export function sum(values: Iterable<Minor>): Minor {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Multiply by a ratio and round half away from zero, staying in integers. */
export function scale(minor: Minor, ratio: number): Minor {
  const raw = minor * ratio;
  return raw < 0 ? -Math.round(-raw) : Math.round(raw);
}

export function abs(minor: Minor): Minor {
  return Math.abs(minor);
}

export function median(values: Minor[]): Minor {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, cents: boolean, compact: boolean) {
  const key = `${currency}|${cents}|${compact}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : compact ? 1 : 0,
    });
    formatters.set(key, f);
  }
  return f;
}

export function formatMoney(
  minor: Minor,
  opts: { currency?: string; cents?: boolean; compact?: boolean; signed?: boolean } = {},
): string {
  const { currency = "USD", cents = false, compact = false, signed = false } = opts;
  const text = formatter(currency, cents, compact).format(fromMinor(minor));
  return signed && minor > 0 ? `+${text}` : text;
}
