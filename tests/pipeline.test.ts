import { and, eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { countsAsSpending, type TransactionKind } from "@/lib/finance/categories";
import { schema, type Db } from "@/server/db/client";
import { applySyncBatch } from "@/server/plaid/sync";
import { processUser } from "@/server/pipeline/process";
import { ACCOUNTS, AS_OF, buildHousehold, LIABILITIES, truthSpending, type LabeledTxn } from "./fixtures/household";
import { createUser, testDb } from "./helpers/db";

const NOW = new Date(`${AS_OF}T18:00:00Z`);
const USER = "user_alex";
let db: Db;
let connId: string;
let fixture: LabeledTxn[];

async function ingest() {
  const [conn] = await db
    .insert(schema.connections)
    .values({ userId: USER, itemId: "item_alex", institutionName: "Fixture Bank", accessTokenEnc: "v1.x.y.z" })
    .returning();
  connId = conn!.id;
  fixture = buildHousehold();
  const strip = (t: LabeledTxn) => {
    const { truth: _truth, ...rest } = t;
    return rest;
  };
  // Deliver in two pages' worth of batches, like an initial + historical sync.
  const half = Math.floor(fixture.length / 2);
  await applySyncBatch(db, { id: connId, userId: USER }, { accounts: ACCOUNTS, added: fixture.slice(0, half).map(strip), modified: [], removed: [], nextCursor: "c1", liabilities: LIABILITIES }, NOW);
  await applySyncBatch(db, { id: connId, userId: USER }, { accounts: ACCOUNTS, added: fixture.slice(half).map(strip), modified: [], removed: [], nextCursor: "c2", liabilities: LIABILITIES }, NOW);
  return processUser(USER, NOW);
}

describe("ingestion → classification → planning (synthetic household)", () => {
  let picture: Awaited<ReturnType<typeof processUser>>;

  beforeAll(async () => {
    ({ db } = await testDb());
    await createUser(db, USER);
    picture = await ingest();
  }, 120_000);

  async function rows() {
    const r = await db.select().from(schema.transactions).where(and(eq(schema.transactions.userId, USER), isNull(schema.transactions.removedAt)));
    const byProvider = new Map(r.map((x) => [x.providerId, x]));
    return { r, byProvider };
  }

  it("imports every record exactly once with the sign flipped once", async () => {
    const { r, byProvider } = await rows();
    expect(r.length).toBe(fixture.length);
    const payroll = fixture.find((t) => t.name?.startsWith("ACME"))!;
    expect(byProvider.get(payroll.transaction_id)!.amountMinor).toBe(315000);
    const [conn] = await db.select().from(schema.connections).where(eq(schema.connections.id, connId));
    expect(conn!.cursor).toBe("c2");
  });

  it("normalizes merchants without touching source facts", async () => {
    const { byProvider } = await rows();
    const amzn = fixture.find((t) => t.name?.startsWith("AMZN Mktp"))!;
    const row = byProvider.get(amzn.transaction_id)!;
    expect(row.merchant).toBe("Amazon");
    expect(row.name).toBe(amzn.name);
  });

  it("classifies kinds with ≥98% accuracy and categories with ≥95% on unambiguous records", async () => {
    const { byProvider } = await rows();
    const clear = fixture.filter((t) => !t.truth.ambiguous);
    const kindOk = clear.filter((t) => byProvider.get(t.transaction_id)!.kind === t.truth.kind);
    const catOk = clear.filter((t) => byProvider.get(t.transaction_id)!.category === t.truth.category);
    const wrong = clear
      .filter((t) => byProvider.get(t.transaction_id)!.category !== t.truth.category || byProvider.get(t.transaction_id)!.kind !== t.truth.kind)
      .map((t) => `${t.name}: ${byProvider.get(t.transaction_id)!.kind}/${byProvider.get(t.transaction_id)!.category} ≠ ${t.truth.kind}/${t.truth.category}`);
    expect(kindOk.length / clear.length, wrong.join("\n")).toBeGreaterThanOrEqual(0.98);
    expect(catOk.length / clear.length, wrong.join("\n")).toBeGreaterThanOrEqual(0.95);
  });

  it("pairs transfers, card repayments, mortgage and IRA contributions so nothing is double counted", async () => {
    const { r } = await rows();
    const paired = r.filter((x) => x.transferPairId);
    const cardLegs = r.filter((x) => x.kind === "card_payment");
    expect(cardLegs.length).toBeGreaterThan(10);
    expect(cardLegs.every((x) => x.transferPairId)).toBe(true);
    const mortgage = r.filter((x) => x.name === "ROCKET MORTGAGE PMT");
    expect(mortgage.every((x) => x.kind === "loan_payment" && x.category === "housing" && x.transferPairId)).toBe(true);
    const loanSide = r.filter((x) => x.name === "PAYMENT RECEIVED");
    expect(loanSide.every((x) => x.kind === "transfer")).toBe(true);
    expect(paired.length % 2).toBe(0);
  });

  it("computes a historical spending baseline that reconciles with ground truth", () => {
    for (const m of picture.baseline.monthlyTotals) {
      expect(m.spending, m.month).toBe(truthSpendingOrClassified(m.month));
    }
    function truthSpendingOrClassified(month: string) {
      // Ambiguous items are counted as spending by both (they are expenses); only their category may differ.
      return truthSpending(fixture, month);
    }
    expect(picture.baseline.monthsAnalyzed).toBe(6);
    expect(picture.baseline.coverage).toBe("good");
  });

  it("identifies recurring income and obligations", () => {
    const kinds = (k: string) => picture.recurring.filter((r) => r.kind === k).map((r) => r.merchant);
    expect(kinds("income")).toEqual(expect.arrayContaining(["Acme Corp Payroll PPD ID", "Gusto Pay Brightline"].map((x) => expect.stringContaining(x.split(" ")[0]!))));
    const bills = [...kinds("bill"), ...kinds("subscription")];
    expect(bills.join("|")).toMatch(/Rocket Mortgage/);
    expect(bills.join("|")).toMatch(/Netflix/);
    expect(bills.join("|")).toMatch(/Geico/i);
    const payroll = picture.recurring.find((r) => r.merchant.startsWith("Acme"))!;
    expect(payroll.cadence).toBe("biweekly");
    const gusto = picture.recurring.find((r) => r.merchant.startsWith("Gusto"))!;
    expect(gusto.cadence).toBe("semimonthly");
  });

  it("determines income, savings capacity and a savings rate", () => {
    const b = picture.baseline;
    // Biweekly 3,150 (26/yr) + semimonthly 1,850 (24/yr), per month.
    const expectedIncome = Math.round(315000 * (26 / 12)) + 1850_00 * 2;
    expect(b.income).toBeGreaterThanOrEqual(expectedIncome);
    expect(b.income).toBeLessThanOrEqual(Math.round(expectedIncome * 1.15));
    expect(b.savingsCapacity).toBe(b.income - b.spending);
    expect(b.savingsRate).toBeGreaterThan(0);
    expect(picture.flows.investingMonthly).toBe(500_00);
    expect(picture.flows.savingsMonthly).toBe(400_00);
  });

  it("generates a suggested budget from history", () => {
    const cats = picture.budget.lines.map((l) => l.category);
    expect(cats).toEqual(expect.arrayContaining(["housing", "groceries", "dining", "utilities"]));
    expect(cats).not.toContain("transfer");
    expect(cats).not.toContain("card_payment");
  });

  it("calculates cash after bills from checking and savings, bills before payday and a buffer — not the raw balance", () => {
    const s = picture.safeToSpend;
    expect(["ok", "estimate"]).toContain(s.status);
    expect(s.horizonReason).toBe("next_income");
    const paychecks = s.breakdown.filter((b) => b.label.startsWith("Paycheck")).reduce((a, b) => a + b.amount, 0);
    expect(s.amount).toBeLessThan(picture.position.cash + picture.position.reserves + paychecks);
    expect(s.breakdown.find((b) => b.label === "Savings")?.amount).toBe(picture.position.reserves);
    const total = s.breakdown.reduce((a, b) => a + b.amount, 0);
    expect(total).toBe(s.amount);
  });

  it("only sends genuinely ambiguous records to review", async () => {
    const { r } = await rows();
    const review = r.filter((x) => x.needsReview);
    expect(review.length).toBeGreaterThan(0);
    expect(review.length).toBeLessThanOrEqual(15);
    const reviewNames = new Set(review.map((x) => x.name));
    expect(reviewNames.has("PAYPAL *JSMITHDESIGN")).toBe(true);
    expect(reviewNames.has("CHECK #1042")).toBe(true);
  });

  it("spending totals exclude every transfer kind", async () => {
    const { r } = await rows();
    const nonSpending: TransactionKind[] = ["transfer", "card_payment", "investment_transfer", "income"];
    for (const k of nonSpending) expect(countsAsSpending(k)).toBe(false);
    const transfersOut = r.filter((x) => nonSpending.includes(x.kind as TransactionKind) && x.amountMinor < 0).reduce((a, x) => a - x.amountMinor, 0);
    expect(transfersOut).toBeGreaterThan(0); // they exist…
    const total = picture.baseline.monthlyTotals.reduce((a, m) => a + m.spending, 0);
    const truth = picture.baseline.monthlyTotals.reduce((a, m) => a + truthSpending(fixture, m.month), 0);
    expect(total).toBe(truth); // …and none of them leaked into spending.
  });

  it("is idempotent: reprocessing and redelivering the same sync changes nothing", async () => {
    const before = await rows();
    const strip = (t: LabeledTxn) => {
      const { truth: _t, ...rest } = t;
      return rest;
    };
    await applySyncBatch(db, { id: connId, userId: USER }, { accounts: ACCOUNTS, added: fixture.map(strip), modified: [], removed: [], nextCursor: "c2", liabilities: LIABILITIES }, NOW);
    const p2 = await processUser(USER, NOW);
    const after = await rows();
    expect(after.r.length).toBe(before.r.length);
    expect(p2.baseline.spending).toBe(picture.baseline.spending);
  });

  it("reconciles pending → posted in place, keeping user edits, and applies removals", async () => {
    const { byProvider } = await rows();
    const pending = byProvider.get("tx_pending_nopa")!;
    await db.update(schema.transactions).set({ note: "Anniversary dinner", userLocked: true }).where(eq(schema.transactions.id, pending.id));
    const posted = { ...fixture.find((t) => t.transaction_id === "tx_pending_nopa")!, transaction_id: "tx_posted_nopa", pending: false, pending_transaction_id: "tx_pending_nopa", amount: 96.3 };
    const { truth: _t, ...postedRaw } = posted;
    await applySyncBatch(db, { id: connId, userId: USER }, { accounts: ACCOUNTS, added: [postedRaw], modified: [], removed: [{ transaction_id: "tx_pending_nopa" }, { transaction_id: "tx_pending_wf" }], nextCursor: "c3" }, NOW);
    const after = await rows();
    const row = after.byProvider.get("tx_posted_nopa")!;
    expect(row.id).toBe(pending.id);
    expect(row.pending).toBe(false);
    expect(row.amountMinor).toBe(-9630);
    expect(row.note).toBe("Anniversary dinner");
    expect(after.byProvider.has("tx_pending_nopa")).toBe(false);
    expect(after.byProvider.has("tx_pending_wf")).toBe(false); // removed
    expect(after.r.length).toBe(fixture.length - 1);
  });
});
