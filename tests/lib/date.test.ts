import { describe, it, expect } from "vitest";
import {
  isDateOnlyString,
  formatDateForDatabase,
  parseDateOnly,
  parseDateInputValue,
  formatStoredDate,
  toDateInputValue,
  dateInputValueToJstTimestamp,
  getSortableDateValue,
} from "@/lib/date";

// ---------------------------------------------------------------------------
// isDateOnlyString
// ---------------------------------------------------------------------------

describe("isDateOnlyString", () => {
  it("returns true for valid YYYY-MM-DD string", () => {
    expect(isDateOnlyString("2025-04-01")).toBe(true);
  });

  it("returns true for boundary date 2025-03-31", () => {
    expect(isDateOnlyString("2025-03-31")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isDateOnlyString("")).toBe(false);
  });

  it("returns false for ISO datetime string", () => {
    expect(isDateOnlyString("2025-04-01T00:00:00Z")).toBe(false);
  });

  it("returns false for slash-separated date", () => {
    expect(isDateOnlyString("2025/04/01")).toBe(false);
  });

  it("returns false for single-digit month/day", () => {
    expect(isDateOnlyString("2025-4-1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatDateForDatabase
// ---------------------------------------------------------------------------

describe("formatDateForDatabase", () => {
  it("formats a Date object to YYYY-MM-DD in JST", () => {
    // 2025-04-01 00:00:00 JST = 2025-03-31 15:00:00 UTC
    const date = new Date("2025-03-31T15:00:00Z");
    expect(formatDateForDatabase(date)).toBe("2025-04-01");
  });

  it("handles year boundary correctly (Dec 31 JST)", () => {
    // 2025-12-31 23:00:00 JST = 2025-12-31 14:00:00 UTC
    const date = new Date("2025-12-31T14:00:00Z");
    expect(formatDateForDatabase(date)).toBe("2025-12-31");
  });

  it("handles year boundary correctly (Jan 1 JST from late UTC)", () => {
    // 2026-01-01 01:00:00 JST = 2025-12-31 16:00:00 UTC
    const date = new Date("2025-12-31T16:00:00Z");
    expect(formatDateForDatabase(date)).toBe("2026-01-01");
  });
});

// ---------------------------------------------------------------------------
// parseDateOnly
// ---------------------------------------------------------------------------

describe("parseDateOnly", () => {
  it("parses a valid date-only string into a Date", () => {
    const date = parseDateOnly("2025-04-01");
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(3); // April = month 3 (0-indexed)
    expect(date.getDate()).toBe(1);
  });

  it("parses fiscal year boundary 3/31", () => {
    const date = parseDateOnly("2025-03-31");
    expect(date.getMonth()).toBe(2); // March = month 2
    expect(date.getDate()).toBe(31);
  });

  it("throws for invalid format", () => {
    expect(() => parseDateOnly("not-a-date")).toThrow("Invalid date-only string");
  });

  it("throws for ISO datetime string", () => {
    expect(() => parseDateOnly("2025-04-01T00:00:00Z")).toThrow();
  });

  it("throws for empty string", () => {
    expect(() => parseDateOnly("")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseDateInputValue
// ---------------------------------------------------------------------------

describe("parseDateInputValue", () => {
  it("parses YYYY-MM-DD format", () => {
    const result = parseDateInputValue("2025-04-01");
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2025);
    expect(result!.getMonth()).toBe(3);
    expect(result!.getDate()).toBe(1);
  });

  it("parses slash-separated format YYYY/MM/DD", () => {
    const result = parseDateInputValue("2025/04/01");
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2025);
  });

  it("returns null for empty string", () => {
    expect(parseDateInputValue("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseDateInputValue("   ")).toBeNull();
  });

  it("returns null for unparseable string", () => {
    expect(parseDateInputValue("not-a-date")).toBeNull();
  });

  it("trims whitespace before parsing", () => {
    const result = parseDateInputValue("  2025-04-01  ");
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2025);
  });
});

// ---------------------------------------------------------------------------
// formatStoredDate
// ---------------------------------------------------------------------------

describe("formatStoredDate", () => {
  it("formats date-only string with default slash separator", () => {
    expect(formatStoredDate("2025-04-01")).toBe("2025/04/01");
  });

  it("formats date-only string with custom separator", () => {
    expect(formatStoredDate("2025-04-01", ".")).toBe("2025.04.01");
  });

  it("returns empty string for null", () => {
    expect(formatStoredDate(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatStoredDate(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(formatStoredDate("")).toBe("");
  });

  it("formats ISO datetime string using JST", () => {
    // 2025-03-31T15:00:00Z = 2025-04-01 00:00 JST
    const result = formatStoredDate("2025-03-31T15:00:00Z");
    expect(result).toBe("2025/04/01");
  });

  it("returns original value for unparseable string", () => {
    expect(formatStoredDate("invalid-date")).toBe("invalid-date");
  });
});

// ---------------------------------------------------------------------------
// toDateInputValue
// ---------------------------------------------------------------------------

describe("toDateInputValue", () => {
  it("returns date-only string as-is", () => {
    expect(toDateInputValue("2025-04-01")).toBe("2025-04-01");
  });

  it("returns empty string for null", () => {
    expect(toDateInputValue(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(toDateInputValue(undefined)).toBe("");
  });

  it("converts ISO datetime to date-only in JST", () => {
    // 2025-03-31T15:00:00Z = 2025-04-01 JST
    expect(toDateInputValue("2025-03-31T15:00:00Z")).toBe("2025-04-01");
  });

  it("returns empty string for invalid date string", () => {
    expect(toDateInputValue("not-a-date")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// dateInputValueToJstTimestamp
// ---------------------------------------------------------------------------

describe("dateInputValueToJstTimestamp", () => {
  it("converts date-only to JST midnight timestamp", () => {
    expect(dateInputValueToJstTimestamp("2025-04-01")).toBe(
      "2025-04-01T00:00:00+09:00",
    );
  });

  it("throws for non date-only input", () => {
    expect(() => dateInputValueToJstTimestamp("invalid")).toThrow(
      "Invalid date input value",
    );
  });

  it("throws for ISO datetime input", () => {
    expect(() =>
      dateInputValueToJstTimestamp("2025-04-01T00:00:00Z"),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// getSortableDateValue
// ---------------------------------------------------------------------------

describe("getSortableDateValue", () => {
  it("returns timestamp for date-only string", () => {
    const result = getSortableDateValue("2025-04-01");
    expect(result).toBeGreaterThan(0);
  });

  it("returns 0 for null", () => {
    expect(getSortableDateValue(null)).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(getSortableDateValue(undefined)).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(getSortableDateValue("")).toBe(0);
  });

  it("returns 0 for unparseable string", () => {
    expect(getSortableDateValue("invalid")).toBe(0);
  });

  it("returns correct ordering: earlier date < later date", () => {
    const march31 = getSortableDateValue("2025-03-31");
    const april1 = getSortableDateValue("2025-04-01");
    expect(march31).toBeLessThan(april1);
  });

  it("handles ISO datetime string", () => {
    const result = getSortableDateValue("2025-04-01T10:00:00Z");
    expect(result).toBeGreaterThan(0);
  });
});
