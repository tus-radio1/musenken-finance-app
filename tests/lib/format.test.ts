import { describe, it, expect } from "vitest";
import { formatCurrency } from "@/lib/format";

describe("formatCurrency", () => {
  it("formats a positive integer as Japanese Yen", () => {
    expect(formatCurrency(1234)).toBe("￥1,234");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("￥0");
  });

  it("formats a negative amount", () => {
    expect(formatCurrency(-5000)).toBe("-￥5,000");
  });

  it("formats a large amount with commas", () => {
    expect(formatCurrency(1000000)).toBe("￥1,000,000");
  });
});
