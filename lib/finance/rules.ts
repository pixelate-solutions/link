import { CATEGORIES, type CategoryId, type TransactionKind } from "./categories";
import type { RuleCondition } from "./classify";

const SYNONYMS: Record<string, CategoryId> = {
  grocery: "groceries", groceries: "groceries", supermarket: "groceries", food: "groceries",
  dining: "dining", restaurant: "dining", restaurants: "dining", "eating out": "dining", takeout: "dining", coffee: "dining", bars: "dining",
  gas: "fuel", gasoline: "fuel", fuel: "fuel", petrol: "fuel",
  shopping: "shopping", clothes: "shopping", clothing: "shopping", household: "shopping",
  rent: "housing", mortgage: "housing", housing: "housing",
  utilities: "utilities", utility: "utilities", internet: "utilities", phone: "utilities", electric: "utilities",
  transport: "transport", transportation: "transport", rideshare: "transport", parking: "transport", transit: "transport", car: "transport",
  insurance: "insurance", health: "healthcare", healthcare: "healthcare", medical: "healthcare", pharmacy: "healthcare", doctor: "healthcare",
  childcare: "childcare", daycare: "childcare", school: "childcare", tuition: "childcare", education: "childcare",
  entertainment: "entertainment", movies: "entertainment", games: "entertainment", concerts: "entertainment",
  subscription: "subscriptions", subscriptions: "subscriptions", streaming: "subscriptions",
  travel: "travel", vacation: "travel", flights: "travel", hotel: "travel", hotels: "travel",
  "personal care": "personal_care", gym: "personal_care", fitness: "personal_care", haircut: "personal_care", beauty: "personal_care",
  home: "home", garden: "home", "home improvement": "home", furniture: "home",
  gifts: "gifts", gift: "gifts", charity: "gifts", donations: "gifts", giving: "gifts",
  pets: "pets", pet: "pets", vet: "pets",
  services: "services", fees: "fees", fee: "fees", taxes: "taxes", tax: "taxes",
  income: "other_income", paycheck: "paycheck", salary: "paycheck", interest: "interest", dividends: "interest",
  transfer: "transfer", transfers: "transfer", investing: "investment", investment: "investment", investments: "investment",
};

export function categoryFromWords(text: string): CategoryId | null {
  const t = text.toLowerCase().trim().replace(/[.!]+$/, "").replace(/^(a|an|the)\s+/, "");
  if (SYNONYMS[t]) return SYNONYMS[t];
  const direct = CATEGORIES.find((c) => c.id === t.replace(/\s+/g, "_") || c.label.toLowerCase() === t);
  if (direct) return direct.id;
  for (const [word, id] of Object.entries(SYNONYMS)) if (new RegExp(`\\b${word}\\b`).test(t)) return id;
  return null;
}

export interface ParsedRule {
  description: string;
  when: RuleCondition;
  unless?: RuleCondition;
  then: { category: CategoryId; kind?: TransactionKind };
  priority: number;
}

/**
 * Parse sentences like:
 *   "Every purchase at Costco is groceries unless it's gasoline"
 *   "Treat Venmo payments to Sam as rent"
 *   "Starbucks should be dining"
 * Returns null when the sentence isn't a recognizable rule.
 */
export function parseRuleText(text: string): ParsedRule[] | null {
  const t = text.trim().replace(/[.!]+$/, "");
  const m =
    t.match(/^(?:every(?:thing|\s+(?:purchase|transaction|charge|payment))?\s+(?:at|from|to)\s+|all\s+(?:purchases\s+)?(?:at|from)\s+|treat\s+)?(.+?)\s+(?:is|are|should\s+(?:be|count\s+as)|counts?\s+as|as|=)\s+(?:always\s+)?(?:my\s+)?([a-z][a-z &]*?)(?:\s+unless\s+(?:it'?s|they'?re|it\s+is|it\s+was|for)?\s*(.+))?$/i);
  if (!m) return null;
  const merchant = m[1]!.replace(/\b(purchases?|payments?|charges?|transactions?)\b/gi, "").trim();
  const cat = categoryFromWords(m[2]!);
  if (!merchant || !cat) return null;
  const rules: ParsedRule[] = [];
  const exceptionText = m[3]?.trim();
  if (exceptionText) {
    const exCat = categoryFromWords(exceptionText);
    const keyword = exceptionText.toLowerCase().replace(/^(a|an|the)\s+/, "").split(/\s+/)[0]!;
    const term = exCat === "fuel" ? "gas" : keyword;
    const unless: RuleCondition = { nameContains: term };
    if (exCat) {
      rules.push({
        description: `${merchant} with "${term}" → ${CATEGORIES.find((c) => c.id === exCat)!.label}`,
        when: { merchant, nameContains: term },
        then: { category: exCat },
        priority: 10,
      });
    }
    rules.push({
      description: `${merchant} → ${CATEGORIES.find((c) => c.id === cat)!.label}, unless "${term}"`,
      when: { merchant },
      unless,
      then: { category: cat },
      priority: 20,
    });
    return rules;
  }
  return [
    {
      description: `${merchant} → ${CATEGORIES.find((c) => c.id === cat)!.label}`,
      when: { merchant },
      then: { category: cat },
      priority: 20,
    },
  ];
}
