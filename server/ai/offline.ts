import { categoryLabel } from "@/lib/finance/categories";
import { parseAmount } from "@/lib/finance/goals";
import { categoryFromWords, parseRuleText } from "@/lib/finance/rules";
import type { ToolCtx } from "./tools";

/**
 * Deterministic planner. Recognizes the most common question shapes, calls
 * the same tools the model would, and writes the answer from their results.
 * Every number in the reply comes from a tool. Used when no model is configured.
 */
type Call = (name: string, input: Record<string, unknown>) => Promise<unknown>;

const $ = (n: number | null | undefined, cents = false) =>
  n == null ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;

const WORD_NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function years(text: string): number | null {
  const m = text.match(/\bin\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+years?\b/i) ?? text.match(/\b(\d+|one|two|three|four|five)\s+years?\s+from\s+now\b/i);
  if (!m) return /\bnext\s+year\b/i.test(text) ? 1 : null;
  return WORD_NUM[m[1]!.toLowerCase()] ?? Number(m[1]);
}

interface Goal {
  title: string;
  headline: string;
  status: string;
  missing_inputs: { key: string; question: string; impact: string }[];
}

function goalLines(goals: { title: string; before: string; after: string; change_years?: number | null; change_months?: number | null }[]) {
  return goals
    .filter((g) => g.before !== g.after)
    .map((g) => {
      let delta = "";
      if (g.change_years) {
        const months = Math.round(Math.abs(g.change_years) * 12);
        delta = months >= 18 ? ` (${Math.abs(g.change_years)} years ${g.change_years < 0 ? "sooner" : "later"})` : ` (about ${months} months ${g.change_years < 0 ? "sooner" : "later"})`;
      } else if (g.change_months) delta = ` (${Math.abs(g.change_months)} months ${g.change_months < 0 ? "sooner" : "later"})`;
      return `- ${g.title}: ${g.before} → ${g.after}${delta}`;
    });
}

export async function answerOffline(ctx: ToolCtx, message: string, call: Call): Promise<string> {
  const text = message.trim();
  const lower = text.toLowerCase();

  // 1. Categorization rules stated in plain language.
  if (/\b(unless|always|should be|counts? as|treat)\b/i.test(text) && parseRuleText(text)) {
    const r = (await call("propose_rule", { text, summary: `Add rule: ${text.replace(/[.!]+$/, "")}` })) as { proposal_id?: string; error?: string };
    if (r.error) return r.error;
    return "Got it. Approve the rule below and Link will apply it to past and future transactions.";
  }

  // 2. Facts the user states about themselves.
  const born = lower.match(/\b(?:born\s+in|birth\s*year\s*(?:is)?)\s+(19\d\d|20[0-2]\d)\b/);
  const age = lower.match(/\b(?:i'?m|i\s+am)\s+(\d{2})(?:\s+years?\s+old)?\b/);
  if (born || (age && !/\$/.test(lower))) {
    const year = born ? Number(born[1]) : new Date().getFullYear() - Number(age![1]);
    await call("save_fact", { key: "birth_year", value: year, user_quote: text.slice(0, 200) });
    const g = (await call("get_goals", {})) as { goals: Goal[] };
    const fi = g.goals.find((x) => x.headline.startsWith("Age"));
    return fi ? `Saved. ${fi.title} now projects to ${fi.headline.toLowerCase()}.` : "Saved. Your projections now use your age.";
  }
  if (/\b(401\s*\(?k\)?|ira|brokerage|investments?)\b/i.test(text) && /\b(i\s+have|there'?s|about|roughly)\b/i.test(text) && parseAmount(text)) {
    const amount = parseAmount(text)! / 100;
    await call("save_fact", { key: "outside_investments", value: amount, user_quote: text.slice(0, 200) });
    const g = (await call("get_goals", {})) as { goals: Goal[] };
    return `Saved ${$(amount)} in outside investments.${g.goals[0] ? ` ${g.goals[0].title}: ${g.goals[0].headline}.` : ""}`;
  }

  // 3. Priority shift: later retirement in exchange for lifestyle (e.g. travel).
  if (/\brather\b/.test(lower) && /\b(later|slower|longer)\b/.test(lower)) {
    const protect = (["travel", "dining", "entertainment"] as const).filter((c) => lower.includes(c === "dining" ? "eat" : c) || (c === "travel" && /\b(trip|vacation)/.test(lower)));
    const r = (await call("propose_preferences", {
      lifestyle_weight: 80,
      protect: protect.length ? protect : undefined,
      summary: `Favor ${protect.length ? protect.map((p) => categoryLabel(p).toLowerCase()).join(" and ") : "lifestyle"} over retiring as early as possible`,
    })) as { proposal_id?: string };
    const amt = parseAmount(text);
    let scenarioLine = "";
    if (amt && protect.includes("travel")) {
      const s = (await call("run_scenario", { title: "More travel", changes: [{ type: "travel", annual_change: amt / 100 }] })) as { goals: { title: string; before: string; after: string; change_years?: number | null }[] };
      scenarioLine = `\n\nWith ${$(amt / 100)} more a year for travel:\n${goalLines(s.goals).join("\n")}`;
    }
    return [
      `Understood: a somewhat later retirement is fine if it means more room to ${protect.includes("travel") ? "travel" : "live well now"}.`,
      r.proposal_id ? "Approve the change below and Link will stop suggesting cuts there and rebalance your plan around it." : "",
      scenarioLine || (protect.includes("travel") ? "\n\nHow much more would you like to spend on travel each year? I'll show exactly what it does to your timeline." : ""),
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  // 4. What-if: a child.
  if (/\b(child|baby|kid|kids)\b/.test(lower) && /\b(what if|if (we|i)|have|having)\b/.test(lower)) {
    const inYears = years(text) ?? 2;
    const cost = parseAmount(text);
    const s = (await call("run_scenario", {
      title: `Child in ${inYears} year${inYears === 1 ? "" : "s"}`,
      changes: [{ type: "child", in_years: inYears, ...(cost ? { monthly_cost: cost / 100 } : {}) }],
    })) as { goals: { title: string; before: string; after: string; change_years?: number | null; change_months?: number | null }[]; assumptions: string[]; monthly_surplus: { before: number; after: number } };
    const lines = goalLines(s.goals);
    return [
      `Here's a child in ${inYears} year${inYears === 1 ? "" : "s"} against your current plan:`,
      lines.length ? lines.join("\n") : "- Your goal timelines barely move.",
      `\nAssumes: ${s.assumptions.join(" ")}`,
      cost ? "" : "\nWhat do you expect childcare and other costs to be each month? That's the number that moves this most.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  // 5. What-if: spend / invest / earn more or less.
  const amount = parseAmount(text);
  if (amount && /\b(what if|what would happen|if i|could i)\b/.test(lower)) {
    const dollars = amount / 100;
    const less = /\b(less|cut|reduce|fewer|lower)\b/.test(lower);
    let change: Record<string, unknown>;
    let title: string;
    if (/\b(invest|save|contribut)/.test(lower) && !/\bspen/.test(lower)) {
      change = { type: "investing", monthly_change: less ? -dollars : dollars };
      title = `Invest ${$(dollars)} ${less ? "less" : "more"} a month`;
    } else if (/\b(earn|income|raise|salary|make)\b/.test(lower)) {
      change = { type: "income", monthly_change: less ? -dollars : dollars };
      title = `Income ${less ? "down" : "up"} ${$(dollars)} a month`;
    } else {
      const cat = categoryFromWords(lower.match(/\bon\s+([a-z ]+?)(?:\s+(?:per|a|each|every)\b|[?.!]|$)/)?.[1] ?? "") ?? undefined;
      change = { type: "spending", monthly_change: less ? -dollars : dollars, ...(cat ? { category: cat } : {}) };
      title = `Spend ${$(dollars)} ${less ? "less" : "more"} a month`;
    }
    const s = (await call("run_scenario", { title, changes: [change] })) as {
      goals: { title: string; before: string; after: string; change_years?: number | null; change_months?: number | null }[];
      assumptions: string[];
      monthly_surplus: { before: number; after: number };
    };
    const lines = goalLines(s.goals);
    return [
      `${title}:`,
      lines.length ? lines.join("\n") : "- None of your goal projections change noticeably.",
      `- Monthly surplus: ${$(s.monthly_surplus.before)} → ${$(s.monthly_surplus.after)}`,
      `\nAssumes: ${s.assumptions.join(" ")} This is a comparison; your plan hasn't changed.`,
    ].join("\n");
  }

  // 6. Affordability.
  if (amount && /\bafford|buy|spend\b/.test(lower)) {
    const monthly = /\b(a|per|each)\s+month\b|\/mo\b|monthly/.test(lower);
    const r = (await call("check_affordability", { amount: amount / 100, monthly })) as {
      safe_to_spend_now: number;
      fits_safe_to_spend: boolean;
      would_dip_below_zero: boolean;
      savings_available: number;
      lowest_cash_after_purchase_next_30_days: number;
      goal_impact_if_monthly: { title: string; before: string; after: string }[] | null;
      limitations: string[];
    };
    if (monthly && r.goal_impact_if_monthly) {
      const lines = r.goal_impact_if_monthly.filter((g) => g.before !== g.after).map((g) => `- ${g.title}: ${g.before} → ${g.after}`);
      return [`A new ${$(amount / 100)} monthly cost would come out of what you invest:`, ...(lines.length ? lines : ["- Your goal timelines barely move."])].join("\n");
    }
    if (r.fits_safe_to_spend) return `Yes. ${$(amount / 100)} fits within your ${$(r.safe_to_spend_now)} Safe to Spend, with bills and your buffer already covered.`;
    if (!r.would_dip_below_zero) {
      return `Not from this paycheck's room: Safe to Spend is ${$(r.safe_to_spend_now)}. Checking wouldn't go negative (lowest about ${$(r.lowest_cash_after_purchase_next_30_days)} over the next 30 days), but it would eat into your buffer${r.savings_available > amount / 100 ? `, or you could use savings (${$(r.savings_available)})` : ""}.`;
    }
    return `Not right now. It would push checking to about ${$(r.lowest_cash_after_purchase_next_30_days)} in the next 30 days. Safe to Spend is ${$(r.safe_to_spend_now)}.`;
  }

  // 7. Safe to spend.
  if (/\b(safe(ly)?\s+(to\s+)?spend|how much can i spend|spend this (week|weekend|month))\b/.test(lower)) {
    const o = (await call("get_financial_overview", {})) as { safe_to_spend: { status: string; amount: number; per_day: number; until: string; limitations: string[] } };
    const s = o.safe_to_spend;
    if (s.status === "unavailable") return s.limitations[0] ?? "Connect a checking account to calculate this.";
    return `${$(s.amount)} until ${new Date(`${s.until}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, about ${$(s.per_day)} a day. That's after upcoming bills, scheduled savings and a safety buffer.${s.limitations.length ? ` ${s.limitations.join(" ")}` : ""}`;
  }

  // 8. Why a category?
  if (/\bwhy\b.*\b(categor|groceries|dining|labeled|marked)/.test(lower)) {
    const q = text.match(/\b(?:at|from|for)\s+([A-Za-z0-9'& ]{2,30}?)(?:\s+as\b|\?|$)/)?.[1]?.trim();
    if (q) {
      const rows = (await call("search_transactions", { query: q, limit: 1 })) as { id: string }[];
      if (rows[0]) {
        const e = (await call("explain_transaction", { id: rows[0].id })) as { merchant: string; category: string; reason: string; confidence: number; source: string };
        return `${e.merchant} is in ${categoryLabel(e.category)} because: ${e.reason.toLowerCase()} (confidence ${Math.round(e.confidence * 100)}%). If it's wrong, change it in Activity and Link will remember.`;
      }
    }
    return "Tap the transaction in Activity to see why Link categorized it, and change it in one tap if it's wrong.";
  }

  // 9. "What should I do?" / "How can I retire sooner?"
  if (/\b(what should i|most important|top (three|3)|three (most )?important|retire sooner|retire earlier|improve|next step|priorit)/.test(lower)) {
    const recs = (await call("get_recommendations", { limit: 3 })) as { title: string; detail: string }[];
    if (!recs.length) return "Nothing urgent stands out. Your plan is on course with the information Link has.";
    return [`${recs.length === 1 ? "The most valuable thing" : `The ${recs.length} most valuable things`} you can do now:`, ...recs.map((r, i) => `${i + 1}. ${r.title}. ${r.detail}`)].join("\n");
  }

  // 10. Default: a short status read.
  const [o, g] = (await Promise.all([call("get_financial_overview", {}), call("get_goals", {})])) as [
    { safe_to_spend: { amount: number; status: string }; typical_month: { surplus: number; savings_rate: number | null } },
    { goals: Goal[] },
  ];
  const goal = g.goals[0];
  const parts = [
    o.safe_to_spend.status !== "unavailable" ? `Safe to Spend is ${$(o.safe_to_spend.amount)}.` : "",
    o.typical_month.savings_rate != null ? `You typically keep ${Math.round(o.typical_month.savings_rate * 100)}% of income (${$(o.typical_month.surplus)} a month).` : "",
    goal ? `${goal.title}: ${goal.headline}.` : "",
  ].filter(Boolean);
  const question = goal?.missing_inputs.find((m) => m.impact === "high")?.question;
  return [parts.join(" ") || "Link is still learning your finances.", question ? `\n\nOne thing that would sharpen this: ${question}` : ""].join("");
}
