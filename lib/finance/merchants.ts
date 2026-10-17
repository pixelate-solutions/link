import type { CategoryId } from "./categories";

/**
 * Deterministic merchant normalization. The raw provider description is never
 * modified; this only derives a clean display name and a stable grouping key.
 */

const PROCESSOR_PREFIXES = [
  /^sq\s*\*\s*/i, // Square
  /^tst\s*\*\s*/i, // Toast
  /^sp\s*\*?\s+/i, // Shopify
  /^pp\s*\*\s*/i, // PayPal
  /^paypal\s*\*\s*/i,
  /^py\s*\*\s*/i,
  /^dd\s*\*?\s*(doordash\s*)?/i,
  /^ckо?\s*\*\s*/i,
  /^in\s*\*\s*/i,
  /^pos\s+(debit|purchase)?\s*/i,
  /^debit\s+card\s+purchase\s*/i,
  /^purchase\s+authorized\s+on\s+\d{1,2}\/\d{1,2}\s*/i,
  /^recurring\s+payment\s*/i,
  /^ach\s+(debit|credit)?\s*/i,
];

interface KnownMerchant {
  pattern: RegExp;
  name: string;
  category?: CategoryId;
}

/** Small curated dictionary for very common merchants with messy descriptors. */
const KNOWN: KnownMerchant[] = [
  { pattern: /\bamzn\b|\bamazon\b|amazon\.com|amzn\s*mktp/i, name: "Amazon", category: "shopping" },
  { pattern: /\bprime\s*video\b/i, name: "Prime Video", category: "subscriptions" },
  { pattern: /\bnetflix\b/i, name: "Netflix", category: "subscriptions" },
  { pattern: /\bspotify\b/i, name: "Spotify", category: "subscriptions" },
  { pattern: /\bhulu\b/i, name: "Hulu", category: "subscriptions" },
  { pattern: /disney\s*(plus|\+)/i, name: "Disney+", category: "subscriptions" },
  { pattern: /apple\.com\/bill|\bapple\s+services\b/i, name: "Apple", category: "subscriptions" },
  { pattern: /\bgoogle\s*\*?\s*(storage|youtube|one)\b/i, name: "Google", category: "subscriptions" },
  { pattern: /\bopenai\b|chatgpt/i, name: "OpenAI", category: "subscriptions" },
  { pattern: /\bcostco\s*gas\b/i, name: "Costco Gas", category: "fuel" },
  { pattern: /\bcostco\b/i, name: "Costco", category: "groceries" },
  { pattern: /\btrader\s*joe/i, name: "Trader Joe's", category: "groceries" },
  { pattern: /\bwhole\s*foods\b|\bwholefds\b/i, name: "Whole Foods", category: "groceries" },
  { pattern: /\bkroger\b/i, name: "Kroger", category: "groceries" },
  { pattern: /\bsafeway\b/i, name: "Safeway", category: "groceries" },
  { pattern: /\baldi\b/i, name: "Aldi", category: "groceries" },
  { pattern: /\bpublix\b/i, name: "Publix", category: "groceries" },
  { pattern: /\bh-?e-?b\b/i, name: "H-E-B", category: "groceries" },
  { pattern: /\bwal-?mart\b|\bwm\s*supercenter\b/i, name: "Walmart", category: "shopping" },
  { pattern: /\btarget\b/i, name: "Target", category: "shopping" },
  { pattern: /\bstarbucks\b/i, name: "Starbucks", category: "dining" },
  { pattern: /\bmcdonald'?s\b/i, name: "McDonald's", category: "dining" },
  { pattern: /\bchipotle\b/i, name: "Chipotle", category: "dining" },
  { pattern: /\bdoordash\b/i, name: "DoorDash", category: "dining" },
  { pattern: /\buber\s*\*?\s*eats\b/i, name: "Uber Eats", category: "dining" },
  { pattern: /\bgrubhub\b/i, name: "Grubhub", category: "dining" },
  { pattern: /\buber\b/i, name: "Uber", category: "transport" },
  { pattern: /\blyft\b/i, name: "Lyft", category: "transport" },
  { pattern: /\bshell\b(?!\s*fish)/i, name: "Shell", category: "fuel" },
  { pattern: /\bchevron\b/i, name: "Chevron", category: "fuel" },
  { pattern: /\bexxon(mobil)?\b/i, name: "Exxon", category: "fuel" },
  { pattern: /\bdelta\s+air/i, name: "Delta", category: "travel" },
  { pattern: /\bunited\s+air/i, name: "United Airlines", category: "travel" },
  { pattern: /\bsouthwest\s+air|\bswa\b/i, name: "Southwest", category: "travel" },
  { pattern: /\bairbnb\b/i, name: "Airbnb", category: "travel" },
  { pattern: /\bmarriott\b/i, name: "Marriott", category: "travel" },
  { pattern: /\bhilton\b/i, name: "Hilton", category: "travel" },
  { pattern: /\bcomcast\b|\bxfinity\b/i, name: "Xfinity", category: "utilities" },
  { pattern: /\bverizon\b/i, name: "Verizon", category: "utilities" },
  { pattern: /\bt-?mobile\b/i, name: "T-Mobile", category: "utilities" },
  { pattern: /\bat&t\b|\batt\s*\*?bill/i, name: "AT&T", category: "utilities" },
  { pattern: /\bcvs\b/i, name: "CVS", category: "healthcare" },
  { pattern: /\bwalgreens\b/i, name: "Walgreens", category: "healthcare" },
  { pattern: /\bhome\s*depot\b/i, name: "Home Depot", category: "home" },
  { pattern: /\blowe'?s\b/i, name: "Lowe's", category: "home" },
  { pattern: /\bgeico\b/i, name: "GEICO", category: "insurance" },
  { pattern: /\bstate\s*farm\b/i, name: "State Farm", category: "insurance" },
  { pattern: /\bprogressive\b/i, name: "Progressive", category: "insurance" },
  { pattern: /\bvenmo\b/i, name: "Venmo" },
  { pattern: /\bzelle\b/i, name: "Zelle" },
  { pattern: /\bplanet\s*fitness\b/i, name: "Planet Fitness", category: "personal_care" },
];

const NOISE = [
  /\b(ppd|ccd|web|tel)\s*id:?\s*\w*/gi, // ACH company ids
  /\b(des|indn|co\s*id|trace)\s*:.*$/gi, // ACH addenda
  /\bxx+\d*\b/gi, // masked account numbers
  /#\s*\d+/g, // store numbers
  /\*[a-z0-9]{4,}\b/gi, // processor reference codes like *42G7X
  /\b\d{3,}\b/g, // long digit runs (store ids, phone fragments)
  /\b(x{2,}|\*{2,})\d*\b/gi, // masked card numbers
  /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, // dates
  /\b(ca|ny|tx|fl|wa|il|ma|co|or|ga|nc|nj|va|az|pa|oh|mi|mn)\b\s*$/i, // trailing state codes
  /\b(llc|inc|co|corp|ltd)\b\.?/gi,
  /\b(www\.|\.com|\.net)\b/gi,
];

export interface NormalizedMerchant {
  name: string;
  key: string;
  category?: CategoryId;
  known: boolean;
}

const SMALL_WORDS = new Set(["to", "of", "at", "in", "on", "by", "an", "or", "is", "it", "my", "as", "we", "me", "up", "so", "no", "go", "do", "be", "if", "and", "the", "for"]);

function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => {
      if (w.includes("&") && w.length <= 5) return w.toUpperCase(); // PG&E, AT&T
      if (SMALL_WORDS.has(w)) return i === 0 ? w[0]!.toUpperCase() + w.slice(1) : w;
      if (w.length <= 2 && /^[a-z]+$/.test(w)) return w.toUpperCase(); // state codes, "SF"
      return w[0]!.toUpperCase() + w.slice(1);
    })
    .join(" ");
}

export function merchantKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * @param raw provider description (e.g. "SQ *LOCAL COFFEE 9482")
 * @param providerMerchant provider-supplied merchant name, if any (preferred when present)
 */
export function normalizeMerchant(raw: string, providerMerchant?: string | null): NormalizedMerchant {
  const source = `${providerMerchant ?? ""} ${raw}`;
  for (const k of KNOWN) {
    if (k.pattern.test(source)) return { name: k.name, key: merchantKey(k.name), category: k.category, known: true };
  }
  if (providerMerchant && providerMerchant.trim()) {
    const name = providerMerchant.trim();
    return { name, key: merchantKey(name), known: false };
  }
  let s = raw.trim();
  for (const p of PROCESSOR_PREFIXES) s = s.replace(p, "");
  for (const n of NOISE) s = s.replace(n, " ");
  s = s.replace(/[^\p{L}\p{N}&' ]+/gu, " ").replace(/\s+/g, " ").trim();
  if (!s) s = raw.trim() || "Unknown";
  const name = titleCase(s).slice(0, 60);
  return { name, key: merchantKey(name), known: false };
}
