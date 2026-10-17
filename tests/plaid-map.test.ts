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
