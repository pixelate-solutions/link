import { and, eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { schema, type Db } from "@/server/db/client";
import { BUSINESS_ACCOUNTS, buildBusiness, OWNER_DRAW } from "@/server/demo/business";
import { ACCOUNTS, LIABILITIES } from "@/server/demo/household";
import { applySyncBatch } from "@/server/plaid/sync";
import { processUser } from "@/server/pipeline/process";
import { createBusiness, deleteBusiness, setAccountBusiness, updateBusiness } from "@/server/services/business";
import { activeRecommendations, computeContext } from "@/server/services/picture";
import { testDb } from "./helpers/db";
import { NOW, seedHousehold, strip } from "./helpers/household";

const U = "user_biz";
let db: Db;
const biz = buildBusiness();

async function accountId(providerId: string) {
  const [a] = await db.select().from(schema.accounts).where(and(eq(schema.accounts.userId, U), eq(schema.accounts.providerAccountId, providerId)));
  return a!.id;
}

describe("business accounts", () => {
  let before: Awaited<ReturnType<typeof computeContext>>["picture"];
  let businessId: string;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    ({ db } = await testDb());
    const { connId } = await seedHousehold(db, U);
    // The LLC's accounts arrive through the same connection, initially treated as personal.
    await applySyncBatch(db, { id: connId, userId: U }, { accounts: [...ACCOUNTS, ...BUSINESS_ACCOUNTS], added: biz.map(strip), modified: [], removed: [], nextCursor: "biz", liabilities: LIABILITIES }, NOW);
    before = await processUser(U, NOW);
    businessId = (await createBusiness(U, { name: "Rivera Studio LLC", structure: "llc" })).id;
    await setAccountBusiness(U, await accountId("bizchk"), businessId);
    await setAccountBusiness(U, await accountId("bizcc"), businessId);
  }, 120_000);

  it("keeps business revenue and costs out of the personal picture", async () => {
    const { picture: p } = await computeContext(U);
    // Before: client payments looked like personal income.
    expect(before.baseline.income).toBeGreaterThan(p.baseline.income - OWNER_DRAW * 100);
    expect(p.baseline.categories.map((c) => c.category)).not.toEqual(expect.arrayContaining(["software", "contractors", "advertising"]));
    expect(p.safeToSpend.breakdown[0]!.amount).toBe(before.safeToSpend.breakdown[0]!.amount - 18_400_00);
  });

  it("counts owner draws as personal income and not as business expenses", async () => {
    const rows = await db.select().from(schema.transactions).where(and(eq(schema.transactions.userId, U), isNull(schema.transactions.removedAt)));
    const draws = rows.filter((r) => r.category === "owner_draw");
    expect(draws.length).toBeGreaterThan(10);
    expect(draws.every((r) => r.transferPairId)).toBe(true);
    const personalLeg = draws.filter((r) => r.amountMinor > 0);
    expect(personalLeg.every((r) => r.kind === "income")).toBe(true);
    const { picture: p } = await computeContext(U);
    const drawSeries = p.recurring.find((r) => r.category === "owner_draw" && r.kind === "income");
    expect(drawSeries?.cadence).toBe("monthly");
  });

  it("classifies business costs into business categories", async () => {
    const rows = await db.select().from(schema.transactions).where(eq(schema.transactions.userId, U));
    const byName = (n: string) => rows.find((r) => r.name.startsWith(n))!;
    expect(byName("ADOBE").category).toBe("software");
    expect(byName("UPWORK").category).toBe("contractors");
    expect(byName("GOOGLE *ADS").category).toBe("advertising");
    expect(byName("BENCH ACCOUNTING").category).toBe("professional");
    expect(byName("STRIPE TRANSFER").category).toBe("revenue");
    expect(byName("ACH CREDIT ACME").category).toBe("revenue");
  });

  it("summarizes the business on its own terms and reconciles to ground truth", async () => {
    const { picture: p } = await computeContext(U);
    const b = p.businesses[0]!;
    expect(b.name).toBe("Rivera Studio LLC");
    expect(b.cash).toBe(18_400_00);
    expect(b.monthsAnalyzed).toBe(6);
    const truth = (month: string, kinds: string[]) =>
      Math.round(biz.filter((t) => t.date.startsWith(month) && t.account_id !== "chk1" && kinds.includes(t.truth.kind)).reduce((s, t) => s + t.amount, 0) * 100);
    for (const m of b.months) {
      expect(m.revenue, m.month).toBe(-truth(m.month, ["income"]));
      expect(m.expenses, m.month).toBe(truth(m.month, ["expense"]));
      expect(m.draws, m.month).toBe(OWNER_DRAW * 100);
    }
    expect(b.profit).toBe(b.revenue - b.expenses);
    expect(b.topExpenses[0]!.category).toBe("contractors");
    expect(b.recurringCosts.map((r) => r.merchant).join(" ")).toMatch(/Adobe|Figma|Bench/i);
  });

  it("adds the owner's share to net worth, and only counts business cash toward goals when asked", async () => {
    const p1 = (await computeContext(U)).picture;
    expect(p1.position.businessEquity).toBe(18_400_00 - 1_240_50);
    await updateBusiness(U, businessId, { ownershipPct: 50 });
    const c2 = await computeContext(U);
    expect(c2.picture.position.businessEquity).toBe(Math.round((18_400_00 - 1_240_50) / 2));
    const investedBefore = c2.inputs.invested;
    await updateBusiness(U, businessId, { countTowardGoals: true });
    const c3 = await computeContext(U);
    expect(c3.inputs.invested).toBe(investedBefore + 9_200_00);
    await updateBusiness(U, businessId, { ownershipPct: 100, countTowardGoals: false });
  });

  it("recommends a tax set-aside from business profit", async () => {
    const recs = await activeRecommendations(U);
    const tax = recs.find((r) => r.kind === "business_taxes");
    expect(tax?.title).toMatch(/Rivera Studio LLC for taxes/);
  });

  it("turning the business off makes its accounts personal again", async () => {
    await deleteBusiness(U, businessId);
    const { picture: p } = await computeContext(U);
    expect(p.businesses).toHaveLength(0);
    const rows = await db.select().from(schema.transactions).where(and(eq(schema.transactions.userId, U), eq(schema.transactions.category, "owner_draw")));
    expect(rows).toHaveLength(0);
  });
});
