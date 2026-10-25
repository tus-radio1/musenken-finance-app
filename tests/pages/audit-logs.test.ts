import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRoleAccess } from "@/lib/roles/parse";
import { createSupabaseMock } from "../helpers/supabase-mock";

const ACTOR = "11111111-1111-4111-8111-111111111111";
let role = "会計";
let failRead = false;
let db: ReturnType<typeof createSupabaseMock>;
vi.mock("@/lib/auth/context", () => ({
  getCurrentUser: async () => ({ supabase: db.client }),
  getCurrentRoles: async () => buildRoleAccess([{ name: role, type: "general", accountingGroupId: null }]),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
const { default: AuditLogsPage } = await import("@/app/(authenticated)/audit-logs/page");

beforeEach(() => {
  role = "会計";
  failRead = false;
  db = createSupabaseMock((call) => {
    if (failRead) return { error: { message: "unavailable" } };
    if (call.table === "profiles") return { data: [{ id: ACTOR, name: "Deleted actor", deleted_at: "2026-10-24" }] };
    return { data: [{
      id: "log-1", table_name: "transactions", record_id: "record-1", action: "UPDATE",
      changed_by: ACTOR, changed_at: "2026-10-24T15:00:00Z",
      old_data: { description: "before", amount: 100, unchanged: "same" },
      new_data: { description: "<script>alert(1)</script>", amount: 200, unchanged: "same" },
    }], count: 101 };
  });
});

async function render(params: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(await AuditLogsPage({ searchParams: Promise.resolve(params) }));
}

describe("audit logs server page", () => {
  it("denies members before reading audit logs or profiles", async () => {
    role = "member";
    expect(await render()).toContain("アクセス権限がありません");
    expect(db.calls).toHaveLength(0);
  });
  it("rejects malformed search params before querying", async () => {
    expect(await render({ page: "-1" })).toContain("検索条件が不正です");
    expect(db.calls).toHaveLength(0);
  });
  it("queries a bounded page with all filters and deterministic descending order", async () => {
    const html = await render({ page: "2", table: "transactions", action: "UPDATE", actor: ACTOR, from: "2026-10-25", to: "2026-10-25" });
    expect(db.calls.find((call) => call.table === "audit_logs")?.filters).toEqual([
      { method: "eq", args: ["table_name", "transactions"] },
      { method: "eq", args: ["action", "UPDATE"] },
      { method: "eq", args: ["changed_by", ACTOR] },
      { method: "gte", args: ["changed_at", "2026-10-24T15:00:00.000Z"] },
      { method: "lt", args: ["changed_at", "2026-10-25T15:00:00.000Z"] },
      { method: "order", args: ["changed_at", { ascending: false }] },
      { method: "order", args: ["id", { ascending: false }] },
      { method: "range", args: [50, 99] },
    ]);
    expect(html).toContain("全 101 件・2 / 3 ページ");
    expect(html).toContain("前へ");
    expect(html).toContain("次へ");
  });
  it("resolves deleted actors and renders literal text with changed keys only", async () => {
    const html = await render();
    expect(db.calls.find((call) => call.table === "profiles")?.filters).not.toContainEqual({ method: "is", args: ["deleted_at", null] });
    expect(html).toContain("Deleted actor");
    expect(html).toContain("（削除済み）");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("変更内容（2 項目）");
    expect(html).not.toContain("unchanged");
    expect(html).toContain("2026/10/25 00:00:00");
  });
  it("shows a recoverable error when reads fail", async () => {
    failRead = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await render()).toContain("変更履歴を取得できませんでした");
    } finally {
      log.mockRestore();
    }
  });
});
