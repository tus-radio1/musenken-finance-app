import { describe, expect, it } from "vitest";
import { checkReceiptPathUpdates } from "@/lib/receipt-upload";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("checkReceiptPathUpdates", () => {
  it("ignores absent columns", () => {
    expect(checkReceiptPathUpdates({ name: "x" }, { receipt_url: "a" }, USER)).toEqual({
      ok: true,
      normalized: {},
      changed: [],
    });
  });

  it("keeps an unchanged stored value even when it is not owned", () => {
    const result = checkReceiptPathUpdates(
      { evidence_url: `${OTHER}/a.png` },
      { evidence_url: `${OTHER}/a.png` },
      USER,
    );
    expect(result).toEqual({
      ok: true,
      normalized: { evidence_url: `${OTHER}/a.png` },
      changed: [],
    });
  });

  it("allows clearing with null or an empty string", () => {
    const result = checkReceiptPathUpdates(
      { receipt_url: null, evidence_url: "" },
      { receipt_url: `${OTHER}/r.png`, evidence_url: `${OTHER}/e.png` },
      USER,
    );
    expect(result).toEqual({
      ok: true,
      normalized: { receipt_url: null, evidence_url: null },
      changed: ["receipt_url", "evidence_url"],
    });
  });

  it("treats an empty string as unchanged when nothing is stored", () => {
    expect(checkReceiptPathUpdates({ receipt_url: "" }, { receipt_url: null }, USER)).toEqual({
      ok: true,
      normalized: { receipt_url: null },
      changed: [],
    });
  });

  it("accepts a new path under the actor's prefix", () => {
    const result = checkReceiptPathUpdates({ receipt_url: `${USER}/n.png` }, {}, USER);
    expect(result).toEqual({
      ok: true,
      normalized: { receipt_url: `${USER}/n.png` },
      changed: ["receipt_url"],
    });
  });

  it.each([
    ["foreign prefix", `${OTHER}/n.png`],
    ["external URL", "https://example.com/n.png"],
    ["traversal", `${USER}/../${OTHER}/n.png`],
    ["non-string", 42],
  ])("rejects a changed %s", (_label, value) => {
    expect(checkReceiptPathUpdates({ evidence_url: value }, {}, USER)).toEqual({
      ok: false,
    });
  });
});
