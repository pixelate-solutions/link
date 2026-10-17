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
