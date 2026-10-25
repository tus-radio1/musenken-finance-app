import { describe, expect, it } from "vitest";
import { auditReceiptNames, receiptObjectName } from "@/lib/receipt-object-name.mjs";

describe("receipt report normalization", () => {
  it.each([
    ["legacy_uuid.pdf", "legacy_uuid.pdf"],
    ["user-id/file.pdf", "user-id/file.pdf"],
    ["https://host/storage/v1/object/public/receipts/user-id/file.pdf", "user-id/file.pdf"],
    ["https://host/storage/v1/object/sign/receipts/user-id%2Ffile.pdf?token=x", "user-id/file.pdf"],
    ["https://legacy.example/receipts/legacy_uuid.pdf", "legacy_uuid.pdf"],
    [null, null], ["", null], ["../file.pdf", null],
    ["https://host/%ZZ.pdf", null], ["https://host/", null],
  ])("normalizes %s to %s", (input, expected) => {
    expect(receiptObjectName(input)).toBe(expected);
  });

  it("finds nested old/new receipt and evidence audit fields only", () => {
    expect(auditReceiptNames({ old_data: { receipt_url: "a.pdf" }, new_data: {
      nested: [{ evidence_url: "https://host/b.pdf" }], description: "c.pdf",
    } })).toEqual(["a.pdf", "b.pdf"]);
  });
});
