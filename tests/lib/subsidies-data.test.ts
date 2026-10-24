import { describe, expect, it, vi } from "vitest";
import { readAllSubsidies, readProfilesList } from "@/lib/subsidies-data";
import type { AuthContext } from "@/lib/auth/types";
import { buildRoleAccess } from "@/lib/roles/parse";
import { createSupabaseMock } from "../helpers/supabase-mock";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/system-config", () => ({ getAccountingUserIdSync: () => "accounting-system" }));

const accountant = buildRoleAccess([{ name: "会計", type: "accounting", accountingGroupId: null }]);

describe("shared subsidy readers", () => {
  it("denies a non-manager before reading subsidies", async () => {
    const { client } = createSupabaseMock(() => ({ data: [] }));
    const result = await readAllSubsidies({ supabase: client } as unknown as AuthContext, buildRoleAccess([]), 2026);
    expect(result.error).toBe("このページにアクセスする権限がありません");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("preserves year filtering, display enrichment and accounting-only access", async () => {
    const { client, calls } = createSupabaseMock(() => ({ data: [{
      id: "subsidy", applicant_id: "accounting-system", name: "Trip",
      approved_amount: 100, actual_amount: 80, requested_amount: 120,
      profiles: { name: "System" }, accounting_groups: { name: "Team" },
    }] }));
    const result = await readAllSubsidies({ supabase: client } as unknown as AuthContext, accountant, 2026);
    expect(result.error).toBeUndefined();
    expect(result.isAdmin).toBe(false);
    expect(result.data[0]).toMatchObject({
      applicant_name: "会計", accounting_group_name: "Team", calculated_amount: 100, actual_expense: 80,
    });
    expect(calls[0].filters).toContainEqual({ method: "eq", args: ["fiscal_year_id", 2026] });
    expect(calls[0].filters).toContainEqual({ method: "is", args: ["deleted_at", null] });
  });

  it.each(["subsidies", "profiles"])("preserves %s lookup errors", async (kind) => {
    const { client } = createSupabaseMock(() => ({ error: { message: "unavailable" } }));
    const auth = { supabase: client } as unknown as AuthContext;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = kind === "profiles"
        ? await readProfilesList(auth)
        : await readAllSubsidies(auth, accountant, 2026);
      expect(result.error).toBe(kind === "profiles"
        ? "ユーザー一覧の取得に失敗しました" : "支援金申請データの取得に失敗しました");
    } finally {
      log.mockRestore();
    }
  });
});
