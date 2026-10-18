import { describe, expect, it } from "vitest";
import { formatMoney, median, scale, toMinor } from "@/lib/finance/money";

describe("money", () => {
  it("parses decimal strings and numbers without float drift", () => {
    expect(toMinor("12.34")).toBe(1234);
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(toMinor("-0.015")).toBe(-2);
    expect(toMinor("19.999")).toBe(2000);
    expect(toMinor(1234567.89)).toBe(123456789);
    expect(toMinor("5")).toBe(500);
    expect(toMinor(".5")).toBe(50);
  });
  it("rejects garbage", () => {
    expect(() => toMinor("12,34")).toThrow();
    expect(() => toMinor("abc")).toThrow();
    expect(() => toMinor("")).toThrow();
  });
  it("scales and rounds half away from zero", () => {
    expect(scale(1001, 0.5)).toBe(501);
    expect(scale(-1001, 0.5)).toBe(-501);
  });
  it("medians", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBe(0);
  });
  it("formats", () => {
    expect(formatMoney(123456)).toBe("$1,235");
    expect(formatMoney(123456, { cents: true })).toBe("$1,234.56");
    expect(formatMoney(-5000)).toBe("-$50");
    expect(formatMoney(2500, { signed: true })).toBe("+$25");
  });
});

describe("dates", () => {
  it("adds the year only when the date isn't in the current year", async () => {
    const { shortDate } = await import("@/lib/utils");
    const now = new Date("2026-10-17T12:00:00Z");
    expect(shortDate("2026-10-04", undefined, now)).toBe("Oct 4");
    expect(shortDate("2025-12-30", undefined, now)).toBe("Dec 30, 2025");
    expect(shortDate("2025-12-30", { weekday: "short", month: "short", day: "numeric" }, now)).toBe("Tue, Dec 30, 2025");
  });
});

describe("account labels", () => {
  it("names the bank once, fixes all-caps names, and adds the last digits", async () => {
    const { accountLabel } = await import("@/lib/utils");
    expect(accountLabel({ name: "TOTAL CHECKING", mask: "5960", institution: "Chase" })).toBe("Chase Total Checking ··5960");
    expect(accountLabel({ name: "CHASE SAVINGS", mask: "2130", institution: "Chase" })).toBe("Chase Savings ··2130");
    expect(accountLabel({ name: "Discover it Card", mask: "2460", institution: "Discover" })).toBe("Discover it Card ··2460");
    expect(accountLabel({ name: "Brokerage", mask: null, institution: null })).toBe("Brokerage");
  });
});

describe("plain-language answers", () => {
  it("reads amounts, years and dates without a strict format", async () => {
    const { readAnswer } = await import("@/server/ai/answer");
    const today = "2026-10-17";
    expect(readAnswer("children_planned", "May or June of 2028", today)).toBe(1.6);
    expect(readAnswer("children_planned", "in 2 years", today)).toBe(2);
    expect(readAnswer("children_planned", "we're expecting already", today)).toBe(0);
    expect(readAnswer("outside_investments", "about $45k in my 401(k)", today)).toBe(45000);
    expect(readAnswer("birth_year", "I was born in 1998", today)).toBe(1998);
    expect(readAnswer("retirement_spending_annual", "not sure", today)).toBeNull();
  });
});
