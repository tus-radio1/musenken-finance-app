import { describe, expect, it } from "vitest";
import {
  auditChangedFields, auditDateBounds, auditLogParamsSchema, auditPageHref,
  auditRecordSummary, auditValueText, formatAuditTimestamp,
} from "@/lib/audit-log-display";

const actor = "11111111-1111-4111-8111-111111111111";

describe("audit search params", () => {
  it("defaults to the first page and accepts blank filter controls", () => {
    expect(auditLogParamsSchema.parse({ table: "", action: "", actor: "", from: "", to: "" })).toEqual({ page: 1 });
  });
  it.each([
    { page: "0" }, { page: "-1" }, { page: "1.5" }, { page: "NaN" }, { page: "1000001" },
    { table: "unknown" }, { action: "EXECUTE" }, { actor: "invalid" },
    { from: "2026-02-30" }, { to: "yesterday" },
    { from: "2026-10-26", to: "2026-10-25" }, { table: ["profiles", "transactions"] },
  ])("rejects invalid params %j", (params) => {
    expect(auditLogParamsSchema.safeParse(params).success).toBe(false);
  });
  it("retains every filter while changing pages", () => {
    const params = auditLogParamsSchema.parse({ page: "2", table: "transactions", action: "INSERT", actor, from: "2026-10-25", to: "2026-10-25" });
    const url = new URL(auditPageHref(params, 3), "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({ ...params, page: "3" });
  });
  it("includes the entire end date in JST", () => {
    expect(auditDateBounds({ from: "2026-10-25", to: "2026-10-25" })).toEqual({ from: "2026-10-24T15:00:00.000Z", until: "2026-10-25T15:00:00.000Z" });
    expect(auditDateBounds({})).toEqual({ from: undefined, until: undefined });
  });
});

describe("audit diffs", () => {
  it("shows only changed, inserted and removed keys", () => {
    expect(auditChangedFields({ same: 1, amount: 100, removed: true }, { same: 1, amount: 200, added: null })).toEqual([
      { key: "added", before: undefined, after: null },
      { key: "amount", before: 100, after: 200 },
      { key: "removed", before: true, after: undefined },
    ]);
  });
  it("compares nested values independently of JSON object key order", () => {
    expect(auditChangedFields({ nested: { a: 1, b: [2, 3] } }, { nested: { b: [2, 3], a: 1 } })).toEqual([]);
    expect(auditChangedFields({ array: [1, 2] }, { array: [2, 1] })).toHaveLength(1);
  });
  it("handles insert, delete, absent data and unchanged values", () => {
    expect(auditChangedFields(null, { name: "New" })).toEqual([{ key: "name", before: undefined, after: "New" }]);
    expect(auditChangedFields({ name: "Old" }, null)).toEqual([{ key: "name", before: "Old", after: undefined }]);
    expect(auditChangedFields(null, null)).toEqual([]);
  });
  it("keeps text literal and distinguishes missing values from null", () => {
    expect(auditValueText("<script>alert(1)</script>")).toBe("<script>alert(1)</script>");
    expect(auditValueText(undefined)).toBe("（なし）");
    expect(auditValueText(null)).toBe("null");
    expect(auditValueText({ nested: [false, 0] })).toBe('{"nested":[false,0]}');
  });
});

describe("audit summaries", () => {
  it("uses the new transaction values and falls back to old values on delete", () => {
    const old = { date: "2026-10-25", description: "移動", amount: -500 };
    expect(auditRecordSummary("transactions", old, { amount: 700 }, "id")).toBe("2026-10-25 / 移動 / ￥700");
    expect(auditRecordSummary("transactions", old, null, "id")).toContain("移動");
  });
  it("uses names for members and subsidies, with record ID as fallback", () => {
    expect(auditRecordSummary("profiles", null, { name: "部員", student_number: "1234567" }, "id")).toBe("部員 / 1234567");
    expect(auditRecordSummary("subsidy_items", { name: "支援金" }, null, "id")).toBe("支援金");
    expect(auditRecordSummary("transactions", null, null, "id")).toBe("id");
  });
  it("formats a UTC timestamp in JST across the date boundary", () => {
    expect(formatAuditTimestamp("2026-10-24T15:00:00Z")).toBe("2026/10/25 00:00:00");
  });
});
