import { describe, expect, it } from "vitest";
import { mapTransactionFacts } from "@/server/plaid/map";

const base = { transaction_id: "t1", account_id: "a1", amount: 12.5, date: "2026-10-01", name: "STARBUCKS 123", pending: false };

describe("merchant branding from Plaid", () => {
  it("keeps the merchant logo, else the first counterparty logo", () => {
    expect(mapTransactionFacts({ ...base, logo_url: "https://plaid-merchant-logos.plaid.com/starbucks.png" }).logoUrl).toBe("https://plaid-merchant-logos.plaid.com/starbucks.png");
    expect(mapTransactionFacts({ ...base, counterparties: [{ name: "Square" }, { name: "Blue Bottle", logo_url: "https://plaid-counterparty-logos.plaid.com/bb.png", website: "bluebottle.com" }] })).toMatchObject({
      logoUrl: "https://plaid-counterparty-logos.plaid.com/bb.png",
      website: "bluebottle.com",
    });
    expect(mapTransactionFacts(base).logoUrl).toBeNull();
  });
  it("drops anything that isn't an https URL", () => {
    expect(mapTransactionFacts({ ...base, logo_url: "http://example.com/x.png" }).logoUrl).toBeNull();
    expect(mapTransactionFacts({ ...base, logo_url: "javascript:alert(1)" }).logoUrl).toBeNull();
    expect(mapTransactionFacts({ ...base, logo_url: "not a url" }).logoUrl).toBeNull();
  });
});

describe("payment rails", () => {
  it("groups peer payments by payee and keeps checks apart", async () => {
    const { isPaymentRail, railPayee } = await import("@/lib/finance/merchants");
    expect(isPaymentRail("zelle")).toBe(true);
    expect(isPaymentRail("starbucks")).toBe(false);
    expect(railPayee("zelle", "Zelle payment to Sam Park 30859074451")).toBe(railPayee("zelle", "Zelle payment to Sam Park 30552841525"));
    expect(railPayee("zelle", "Zelle payment to Sam Park 30859074451")).toBe("Zelle payment to Sam Park");
    expect(railPayee("check", "CHECK # 141 05/26")).not.toBe(railPayee("check", "CHECK # 142 06/02"));
  });
});

describe("investment balances", () => {
  const acct = { account_id: "k1", name: "401(k)", type: "investment", subtype: "401k", balances: { current: 0, available: null } };
  it("uses holdings when the Investments permission is granted", async () => {
    const { investmentBalances } = await import("@/server/plaid/sync");
    const api = { investmentsHoldingsGet: async () => ({ data: { accounts: [{ account_id: "k1", balances: { current: null } }], holdings: [{ account_id: "k1", institution_value: 41200.5 }, { account_id: "k1", institution_value: 800 }] } }) };
    const r = await investmentBalances(api as never, "tok", [acct]);
    expect(r.needsConsent).toBe(false);
    expect(r.accounts[0]!.balances.current).toBe(42000.5);
  });
  it("keeps every holding with its security, and the investment transactions", async () => {
    const { investmentBalances } = await import("@/server/plaid/sync");
    const api = {
      investmentsHoldingsGet: async () => ({
        data: {
          accounts: [{ account_id: "k1", balances: { current: 1000 } }],
          holdings: [{ account_id: "k1", security_id: "s1", institution_value: 1000, quantity: 10, cost_basis: 900 }],
          securities: [{ security_id: "s1", ticker_symbol: "VTI", name: "Vanguard Total Stock Market" }],
        },
      }),
      investmentsTransactionsGet: async () => ({
        data: { investment_transactions: [{ account_id: "k1", security_id: "s1", type: "buy", amount: 100 }], securities: [{ security_id: "s1", ticker_symbol: "VTI" }], total_investment_transactions: 1 },
      }),
    };
    const r = await investmentBalances(api as never, "tok", [acct]);
    expect(r.details!.k1!.holdings[0]).toMatchObject({ quantity: 10, cost_basis: 900, security: { ticker_symbol: "VTI" } });
    expect(r.details!.k1!.investmentTransactions![0]).toMatchObject({ type: "buy", security: { ticker_symbol: "VTI" } });
  });
  it("flags the connection when the permission is missing, instead of trusting $0", async () => {
    const { investmentBalances } = await import("@/server/plaid/sync");
    const api = { investmentsHoldingsGet: async () => { throw Object.assign(new Error("x"), { response: { data: { error_code: "ADDITIONAL_CONSENT_REQUIRED" } } }); } };
    const r = await investmentBalances(api as never, "tok", [acct]);
    expect(r.needsConsent).toBe(true);
  });
});
