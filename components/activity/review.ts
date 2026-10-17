import { CATEGORIES, type CategoryId, categoryLabel } from "@/lib/finance/categories";

/** How a category reads in a picker: the business-money ones say which way the money went. */
export function pickLabel(c: CategoryId): string {
  if (c === "owner_draw") return "Business → personal (owner draw)";
  if (c === "owner_contribution") return "Personal → business (owner contribution)";
  if (c === "transfer") return "Transfer between my own accounts";
  return categoryLabel(c);
}

/** Categories a person can pick, alphabetically. Card payments are set by pairing, not by hand. */
export const PICKABLE = CATEGORIES.filter((c) => c.id !== "card_payment")
  .map((c) => c.id as CategoryId)
  .sort((a, b) => pickLabel(a).localeCompare(pickLabel(b)));

/** Why a transaction is in "Needs a look", phrased as the question Link is asking. */
export function reviewPrompt(reason: string | null, category: string, kind: string, amount: number): { why: string; ask: string } {
  const label = categoryLabel(category);
  switch (reason) {
    case "Low-confidence bank category":
      return { why: "Your bank wasn't confident about the category.", ask: `Is this ${label}?` };
    case "Looks like a refund":
      return { why: "This looks like money coming back from a purchase.", ask: `Is it a refund for ${label}?` };
    case "A transfer to or from an account Link can't see":
      return { why: `Money moved ${amount < 0 ? "to" : "from"} an account that isn't connected to Link.`, ask: "Is this a transfer between your own accounts?" };
    case "Not enough information to be sure":
      return { why: "There wasn't enough in the bank's description to tell.", ask: kind === "income" ? `Is this ${label}?` : `Is ${label} right?` };
    default:
      return { why: reason ? `${reason}.` : "Link wasn't sure about this one.", ask: `Is this ${label}?` };
  }
}
