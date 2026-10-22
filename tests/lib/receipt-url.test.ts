import { describe, expect, it } from "vitest";
import {
  RECEIPT_VIEW_ROUTE,
  getReceiptViewUrl,
  isSafeReceiptObjectPath,
  toReceiptObjectPath,
} from "@/lib/receipt-url";

const SUPABASE_URL = "https://project.supabase.co";
const USER_PATH = "a0000000-0000-4000-8000-00000000000a/1f6c.png";

function viewUrl(path: string): string {
  return `${RECEIPT_VIEW_ROUTE}?path=${encodeURIComponent(path)}`;
}

describe("isSafeReceiptObjectPath", () => {
  it.each([USER_PATH, "legacy-root_file.pdf", "a/b/c.jpg"])(
    "accepts %s",
    (path) => {
      expect(isSafeReceiptObjectPath(path)).toBe(true);
    },
  );

  it.each([
    "",
    "/leading.png",
    "trailing/",
    "a//b.png",
    "./a.png",
    "a/./b.png",
    "../a.png",
    "a/../b.png",
    "a b.png",
    "a%2Fb.png",
    "a?b.png",
    "https://evil.example/x.png",
  ])("rejects %j", (path) => {
    expect(isSafeReceiptObjectPath(path)).toBe(false);
  });
});

describe("toReceiptObjectPath", () => {
  it("returns relative paths unchanged", () => {
    expect(toReceiptObjectPath(USER_PATH, SUPABASE_URL)).toBe(USER_PATH);
  });

  it("returns null for empty values", () => {
    expect(toReceiptObjectPath(null, SUPABASE_URL)).toBeNull();
    expect(toReceiptObjectPath(undefined, SUPABASE_URL)).toBeNull();
    expect(toReceiptObjectPath("", SUPABASE_URL)).toBeNull();
  });

  it("reduces a legacy public URL of this project to its path", () => {
    const legacy = `${SUPABASE_URL}/storage/v1/object/public/receipts/${USER_PATH}`;
    expect(toReceiptObjectPath(legacy, SUPABASE_URL)).toBe(USER_PATH);
  });

  it("decodes percent-encoded legacy paths once", () => {
    const legacy = `${SUPABASE_URL}/storage/v1/object/public/receipts/dir%2Ffile.png`;
    expect(toReceiptObjectPath(legacy, SUPABASE_URL)).toBe("dir/file.png");
  });

  it.each([
    ["other origin", "https://other.supabase.co/storage/v1/object/public/receipts/a.png"],
    ["other bucket", `${SUPABASE_URL}/storage/v1/object/public/avatars/a.png`],
    ["signed URL", `${SUPABASE_URL}/storage/v1/object/sign/receipts/a.png?token=x`],
    ["query string", `${SUPABASE_URL}/storage/v1/object/public/receipts/a.png?x=1`],
    ["credentials", "https://u:p@project.supabase.co/storage/v1/object/public/receipts/a.png"],
    ["encoded traversal", `${SUPABASE_URL}/storage/v1/object/public/receipts/%2E%2E%2Fsecret.png`],
    ["malformed encoding", `${SUPABASE_URL}/storage/v1/object/public/receipts/%E0%A4%A.png`],
    ["protocol-relative", "//project.supabase.co/storage/v1/object/public/receipts/a.png"],
    ["external URL", "https://evil.example/receipt.png"],
    ["javascript URL", "javascript:alert(1)"],
  ])("rejects %s", (_label, value) => {
    expect(toReceiptObjectPath(value, SUPABASE_URL)).toBeNull();
  });

  it("rejects absolute URLs when the Supabase URL is not configured", () => {
    const legacy = `${SUPABASE_URL}/storage/v1/object/public/receipts/${USER_PATH}`;
    expect(toReceiptObjectPath(legacy, undefined)).toBeNull();
  });
});

describe("getReceiptViewUrl", () => {
  it("links a relative path to the app view route", () => {
    expect(getReceiptViewUrl(USER_PATH, SUPABASE_URL)).toBe(viewUrl(USER_PATH));
  });

  it("links a legacy bucket-root object", () => {
    expect(getReceiptViewUrl("legacy.pdf", SUPABASE_URL)).toBe(
      viewUrl("legacy.pdf"),
    );
  });

  it("links a legacy public URL through the view route, never directly", () => {
    const legacy = `${SUPABASE_URL}/storage/v1/object/public/receipts/${USER_PATH}`;
    const url = getReceiptViewUrl(legacy, SUPABASE_URL);
    expect(url).toBe(viewUrl(USER_PATH));
    expect(url).not.toContain("/storage/v1/object/public/");
  });

  it("returns a same-origin relative URL", () => {
    expect(getReceiptViewUrl(USER_PATH, SUPABASE_URL)?.startsWith("/api/")).toBe(
      true,
    );
  });

  it("returns null for empty or unsafe values", () => {
    expect(getReceiptViewUrl(null, SUPABASE_URL)).toBeNull();
    expect(getReceiptViewUrl("../x.png", SUPABASE_URL)).toBeNull();
    expect(getReceiptViewUrl("https://evil.example/x.png", SUPABASE_URL)).toBeNull();
  });
});
