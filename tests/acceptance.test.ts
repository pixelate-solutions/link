import { and, eq, inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { schema, type Db } from "@/server/db/client";
import { runAgent, type AgentEvent } from "@/server/ai/agent";
import { setModelAdapter } from "@/server/ai/provider";
import { applySyncBatch } from "@/server/plaid/sync";
import { processUser } from "@/server/pipeline/process";
import { confirmTransaction, correctTransaction, searchTransactions, settleReview } from "@/server/services/activity";
import { activeRecommendations, computeContext } from "@/server/services/picture";
import { createGoalsFromStatement, getPreferences } from "@/server/services/plan";
import { listPendingProposals, resolveProposal } from "@/server/services/proposals";
import { ACCOUNTS, AS_OF } from "./fixtures/household";
import { testDb } from "./helpers/db";
import { NOW, seedHousehold } from "./helpers/household";

/**
 * Spec §35 — product-level acceptance on realistic synthetic data. The AI
 * answers here come from Link's deterministic planner (no model key is
 * available in CI); the model-driven loop is covered in agent.test.ts.
 */
const USER = "user_acceptance";
let db: Db;
let connId: string;

async function ask(message: string) {
  const events: AgentEvent[] = [];
  const r = await runAgent({ userId: USER, message, emit: (e) => events.push(e), adapter: null });
  return { text: r.text, events };
}

describe("acceptance: 'retire as soon as possible without sacrificing my lifestyle'", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    ({ db } = await testDb());
    ({ connId } = await seedHousehold(db, USER));
    setModelAdapter(null);
  }, 120_000);

  it("interprets the broad retirement goal without a target amount or date", async () => {
    const r = await createGoalsFromStatement(USER, "I want to retire as soon as possible without completely sacrificing my lifestyle.");
    expect(r.interpretations).toHaveLength(1);
    const g = r.interpretations[0]!;
    expect(g.kind).toBe("financial_independence");
    expect(g.title).toBe("Retire early");
    expect(g.qualifiers.asap).toBe(true);
    expect(g.qualifiers.preserveLifestyle).toBe(true);
    expect(g.target).toEqual({});
    expect((await getPreferences(USER)).lifestyleWeight).toBe(70);
  });

  it("recognizes the missing retirement-planning inputs and asks the most important first", async () => {
    const { picture } = await computeContext(USER);
    const keys = picture.questions.map((q) => q.key);
    expect(keys[0]).toBe("birth_year");
    expect(keys).toEqual(expect.arrayContaining(["birth_year", "retirement_spending_annual", "workplace_contribution_monthly"]));
    expect(keys).not.toContain("home_price");
  });

  it("produces qualified projections: ranges, three scenarios, explicit assumptions", async () => {
    const { picture } = await computeContext(USER);
    const fi = picture.goals[0]!;
    expect(fi.kind).toBe("financial_independence");
    expect(fi.status).toBe("needs_info"); // no age yet → years, not an age
    expect(fi.headline).toMatch(/^In \d+–\d+ years$/);
    expect(fi.fi!.scenarios.map((s) => s.name)).toEqual(["conservative", "base", "optimistic"]);
    const [c, b, o] = fi.fi!.scenarios.map((s) => s.years!);
    expect(c).toBeGreaterThan(b!);
    expect(b).toBeGreaterThan(o!);
    expect(fi.assumptions.join(" ")).toMatch(/Retirement spending equals what you spend today/);
    expect(fi.assumptions.join(" ")).toMatch(/Social Security is not counted/);
  });

  it("turns a stated age into an age-based projection window", async () => {
    const { text } = await ask("I'm 38 years old");
    expect(text).toMatch(/age \d+–\d+/i);
    const { picture } = await computeContext(USER);
    expect(picture.goals[0]!.headline).toMatch(/^Age \d+–\d+$/);
    expect(picture.questions.map((q) => q.key)).not.toContain("birth_year");
  });

  it("identifies and ranks specific, quantified, goal-linked opportunities", async () => {
    const recs = await activeRecommendations(USER);
    const kinds = recs.map((r) => r.kind);
    expect(kinds).toContain("spending_drift"); // dining crept up from ~$360 to ~$600
    expect(kinds).toContain("new_subscription"); // Peloton, $44/mo since August
    expect(kinds).not.toContain("pay_high_interest"); // cards are paid in full: no interest to save
    const drift = recs.find((r) => r.kind === "spending_drift")!;
    expect(drift.title).toMatch(/^Bring dining back to \$\d/);
    expect((drift.impact as { goal?: { goalId: string } }).goal?.goalId).toBeTruthy();
    for (const r of recs) expect(r.title).not.toMatch(/consider|try to|spend less than/i);
    expect(recs.map((r) => r.score)).toEqual([...recs.map((r) => r.score)].sort((a, b) => b - a));
  });

  it("answers 'three most important things to retire sooner' from the recommendation engine", async () => {
    const { text, events } = await ask("What are the three most important things I can do to retire sooner?");
    expect(events.some((e) => e.type === "tool" && e.name === "get_recommendations")).toBe(true);
    expect(text).toMatch(/1\. .*\$/);
    expect(text.split("\n").filter((l) => /^\d\. /.test(l)).length).toBeGreaterThanOrEqual(2);
  });

  it("'What would happen if I spent $300 less per month?' — scenario without touching the plan", async () => {
    const before = (await computeContext(USER)).picture.goals[0]!.headline;
    const { text, events } = await ask("What would happen if I spent $300 less per month?");
    expect(events.some((e) => e.type === "scenario")).toBe(true);
    expect(text).toMatch(/Retire early: Age \d+–\d+ → Age \d+–\d+/);
    expect(text).toMatch(/Assumes: The \$300 you don't spend is invested every month\./);
    expect(text).toMatch(/your plan hasn't changed/);
    expect((await computeContext(USER)).picture.goals[0]!.headline).toBe(before);
  });

  it("'What if I had a child in two years?' — labels cost assumptions and asks only what matters", async () => {
    const { text } = await ask("What if I had a child in two years?");
    expect(text).toMatch(/child in 2 years/);
    expect(text).toMatch(/USDA middle-income estimate/);
    expect(text).toMatch(/What do you expect childcare and other costs to be each month\?/);
    expect((text.match(/\?/g) ?? []).length).toBe(1);
  });

  it("'I would rather retire a little later if it means having more money to travel' updates preferences and adapts recommendations", async () => {
    const before = await activeRecommendations(USER);
    const { text } = await ask("I would rather retire a little later if it means having more money to travel.");
    expect(text).toMatch(/Approve/);
    const [proposal] = await listPendingProposals(USER);
    expect(proposal!.kind).toBe("preferences");
    await resolveProposal(USER, proposal!.id, true);
    const prefs = await getPreferences(USER);
    expect(prefs.lifestyleWeight).toBe(80);
    expect(prefs.protectedCategories).toContain("travel");
    const after = await activeRecommendations(USER);
    const score = (rs: typeof before, k: string) => rs.find((r) => r.kind === k)?.score ?? 0;
    expect(score(after, "spending_drift")).toBeLessThan(score(before, "spending_drift"));
    const { picture } = await computeContext(USER);
    expect(picture.allocations.reduce((s, a) => s + a.monthly, 0)).toBeLessThanOrEqual(picture.flows.surplusUnassigned + picture.allocations.reduce((s, a) => s + a.monthly, 0));
  });

  it("lets the user correct a category and remembers it for future transactions", async () => {
    const { rows } = await searchTransactions(USER, { query: "MKT 4421", limit: 1 });
    const target = rows[0]!;
    const r = await correctTransaction(USER, target.id, { category: "groceries" });
    expect(r.updatedOthers).toBeGreaterThan(0);
    const all = await searchTransactions(USER, { query: "MKT 4421", limit: 50 });
    expect(all.rows.every((x) => x.category === "groceries")).toBe(true);
    // A brand-new charge from the same merchant arrives later.
    await applySyncBatch(db, { id: connId, userId: USER }, {
      accounts: ACCOUNTS,
      added: [{ transaction_id: "tx_new_mkt", account_id: "cc2", amount: 21.4, date: AS_OF, name: "SQ *MKT 4421", pending: false, iso_currency_code: "USD" }],
      modified: [],
      removed: [],
      nextCursor: "c-new",
    }, NOW);
    const [fresh] = await db.select().from(schema.transactions).where(and(eq(schema.transactions.userId, USER), eq(schema.transactions.providerId, "tx_new_mkt")));
    expect(fresh!.category).toBe("groceries");
    expect(fresh!.classSource).toBe("learned");
  });

  it("confirming one 'needs a look' transaction settles every one from that merchant and the next one", async () => {
    const pfc = { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE", confidence_level: "LOW" };
    await applySyncBatch(db, { id: connId, userId: USER }, {
      accounts: ACCOUNTS,
      added: [
        { transaction_id: "tx_acme_1", account_id: "cc2", amount: 310, date: AS_OF, name: "ACME WIDGETS 991", pending: false, iso_currency_code: "USD", personal_finance_category: pfc },
        { transaction_id: "tx_acme_2", account_id: "cc2", amount: 275, date: AS_OF, name: "ACME WIDGETS 991", pending: false, iso_currency_code: "USD", personal_finance_category: pfc },
      ],
      modified: [],
      removed: [],
      nextCursor: "c-acme",
    }, NOW);
    const flagged = await searchTransactions(USER, { query: "ACME WIDGETS", review: true, limit: 10 });
    expect(flagged.rows).toHaveLength(2);
    const r = await confirmTransaction(USER, flagged.rows[0]!.id);
    expect(r.updatedOthers).toBe(1);
    const after = await searchTransactions(USER, { query: "ACME WIDGETS", limit: 10 });
    expect(after.rows.every((x) => !x.needsReview && x.category === flagged.rows[0]!.category)).toBe(true);
    expect(after.rows.find((x) => x.id === flagged.rows[0]!.id)!.reason).toBe("You confirmed this");
    await applySyncBatch(db, { id: connId, userId: USER }, {
      accounts: ACCOUNTS,
      added: [{ transaction_id: "tx_acme_3", account_id: "cc2", amount: 290, date: AS_OF, name: "ACME WIDGETS 991", pending: false, iso_currency_code: "USD", personal_finance_category: pfc }],
      modified: [],
      removed: [],
      nextCursor: "c-acme-2",
    }, NOW);
    const [third] = await db.select().from(schema.transactions).where(and(eq(schema.transactions.userId, USER), eq(schema.transactions.providerId, "tx_acme_3")));
    expect(third!.needsReview).toBe(false);
    expect(third!.classSource).toBe("learned");
  });

  it("settles Zelle payments one recipient at a time and never learns a rule for Zelle itself", async () => {
    await applySyncBatch(db, { id: connId, userId: USER }, {
      accounts: ACCOUNTS,
      added: [
        { transaction_id: "tx_z1", account_id: "chk1", amount: 120, date: AS_OF, name: "ZELLE TO JORDAN LEE", pending: false, iso_currency_code: "USD" },
        { transaction_id: "tx_z2", account_id: "chk1", amount: 95, date: AS_OF, name: "ZELLE TO SAM PARK", pending: false, iso_currency_code: "USD" },
      ],
      modified: [],
      removed: [],
      nextCursor: "c-zelle",
    }, NOW);
    const z = await db.select().from(schema.transactions).where(and(eq(schema.transactions.userId, USER), inArray(schema.transactions.providerId, ["tx_z1", "tx_z2"])));
    const jordan = z.find((r) => r.providerId === "tx_z1")!;
    const sam = z.find((r) => r.providerId === "tx_z2")!;
    expect(jordan.merchantKey).toBe("zelle");
    await settleReview(USER, [jordan.id], "gifts");
    const [j, s2] = await Promise.all([
      db.select().from(schema.transactions).where(eq(schema.transactions.id, jordan.id)),
      db.select().from(schema.transactions).where(eq(schema.transactions.id, sam.id)),
    ]);
    expect(j[0]!.category).toBe("gifts");
    expect(s2[0]!.category).toBe(sam.category);
    expect(s2[0]!.classSource).not.toBe("learned");
  });

  it("fills in merchant logos on redelivery without re-categorizing", async () => {
    const [before] = await db.select().from(schema.transactions).where(and(eq(schema.transactions.userId, USER), eq(schema.transactions.providerId, "tx_acme_1")));
    await applySyncBatch(db, { id: connId, userId: USER }, {
      accounts: ACCOUNTS,
      added: [
        {
          transaction_id: "tx_acme_1",
          account_id: "cc2",
          amount: 310,
          date: AS_OF,
          name: "ACME WIDGETS 991",
          pending: false,
          iso_currency_code: "USD",
          personal_finance_category: { primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE", confidence_level: "LOW" },
          logo_url: "https://plaid-merchant-logos.plaid.com/acme.png",
          website: "acme.example",
        },
      ],
      modified: [],
      removed: [],
      nextCursor: "c-acme-3",
    }, NOW);
    const [after] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, before!.id));
    expect(after!.logoUrl).toBe("https://plaid-merchant-logos.plaid.com/acme.png");
    expect(after!.website).toBe("acme.example");
    expect({ category: after!.category, classSource: after!.classSource, reason: after!.reason, userLocked: after!.userLocked }).toEqual({
      category: before!.category,
      classSource: before!.classSource,
      reason: before!.reason,
      userLocked: before!.userLocked,
    });
  });

  it("updates analyses after new activity: a material new obligation surfaces, a $4 coffee does not", async () => {
    const recsBefore = await activeRecommendations(USER);
    await applySyncBatch(db, { id: connId, userId: USER }, {
      accounts: ACCOUNTS,
      added: [
        { transaction_id: "tx_cof", account_id: "cc2", amount: 4.25, date: AS_OF, name: "SQ *BLUE BOTTLE COFFEE", pending: false, iso_currency_code: "USD" },
      ],
      modified: [],
      removed: [],
      nextCursor: "c-cof",
    }, NOW);
    await processUser(USER, NOW);
    const recsAfterCoffee = await activeRecommendations(USER);
    expect(recsAfterCoffee.map((r) => r.fingerprint).sort()).toEqual(recsBefore.map((r) => r.fingerprint).sort());

    await applySyncBatch(db, { id: connId, userId: USER }, {
      accounts: ACCOUNTS,
      added: ["2026-08-07", "2026-09-07", "2026-10-07"].map((d, i) => ({
        transaction_id: `tx_daycare_${i}`, account_id: "chk1", amount: 210, date: d, name: "BRIGHT HORIZONS TUITION", pending: false, iso_currency_code: "USD",
        personal_finance_category: { primary: "GENERAL_SERVICES", detailed: "GENERAL_SERVICES_CHILDCARE", confidence_level: "HIGH" },
      })),
      modified: [],
      removed: [],
      nextCursor: "c-daycare",
    }, NOW);
    const p = await processUser(USER, NOW);
    expect(p.recurring.some((r) => r.merchant.startsWith("Bright Horizons") && r.cadence === "monthly")).toBe(true);
    const recs = await activeRecommendations(USER);
    expect(recs.some((r) => r.kind === "new_subscription" && r.title.includes("Bright Horizons"))).toBe(true);
  });
});
