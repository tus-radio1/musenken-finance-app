import { describe, expect, it, vi } from "vitest";
import { readLedgerTransactions } from "@/lib/ledger-data";
import { buildRoleAccess } from "@/lib/roles/parse";
import type { AuthContext } from "@/lib/auth/types";
import { createSupabaseMock } from "../helpers/supabase-mock";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/system-config", () => ({ getAccountingUserIdSync: () => "accounting-system" }));

const params = { accountingGroupId: "group", fyYear: 2026 };
const access = buildRoleAccess([]);
const lookups = {
  profiles: [{ id: "member", name: "Member" }],
  financialAccounts: [{ id: "wallet", name: "Cash" }],
};

describe("shared ledger reader", () => {
  it("reuses SSR lookups while still querying the group before protected data", async () => {
    const { client, calls } = createSupabaseMock((call) => {
      if (call.table === "accounting_groups") return { data: { id: "group", type: "general" } };
      if (call.table === "transactions") return { data: [{
        id: "tx", created_by: "member", financial_account_id: "wallet", amount: -100,
        date: "2026-10-01", transaction_kind: "expense", approval_status: "pending",
      }] };
      if (call.table === "budgets") return { data: { amount: 200, carryover_amount: 50 } };
      return { data: [] };
    });
    const auth = { supabase: client } as unknown as AuthContext;
    const result = await readLedgerTransactions(auth, access, params, lookups);
    expect(result).not.toHaveProperty("error");
    if (!result.data) throw new Error("Expected ledger data");
    expect(result.data[0].created_by_name).toBe("Member");
    expect(result.data[0].financial_account_name).toBe("Cash");
    expect(result.budgetAmount).toBe(200);
    expect(result.carryoverAmount).toBe(50);
    expect(calls.map((c) => c.table)).toEqual([
      "accounting_groups", "transactions", "subsidy_items", "budgets",
    ]);
  });

  it.each(["restricted", "missing", "error"])("denies %s groups even with SSR lookups", async (kind) => {
    const { client, calls } = createSupabaseMock(() => ({
      data: kind === "missing" ? null : { id: "group", type: "club" },
      error: kind === "error" ? { message: "unavailable" } : null,
    }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await readLedgerTransactions({ supabase: client } as unknown as AuthContext, access, params, lookups);
      expect(result).toEqual({ error: "アクセス権限がありません" });
      expect(calls.map((c) => c.table)).toEqual(["accounting_groups"]);
    } finally {
      log.mockRestore();
    }
  });
});


it("resolves a soft-deleted member's name on subsequent ledger reads", async () => {
  const { client, calls } = createSupabaseMock((call) => {
    if (call.table === "accounting_groups") return { data: { id: "group", type: "general" } };
    if (call.table === "transactions") return { data: [{
      id: "tx", created_by: "deleted-member", financial_account_id: "wallet", amount: -100,
      date: "2026-10-01", transaction_kind: "expense", approval_status: "pending",
    }] };
    if (call.table === "profiles") return { data: [{ id: "deleted-member", name: "Former member", deleted_at: "2026-10-25" }] };
    return { data: [] };
  });
  const result = await readLedgerTransactions({ supabase: client } as unknown as AuthContext, access, params);
  expect(result.data?.[0].created_by_name).toBe("Former member");
  const profileQuery = calls.find((call) => call.table === "profiles");
  expect(profileQuery?.filters.some((filter) => filter.method === "is" && filter.args[0] === "deleted_at")).toBe(false);
});
