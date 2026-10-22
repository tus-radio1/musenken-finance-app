import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRoleAccess } from "@/lib/roles/parse";
import { createSupabaseMock } from "../helpers/supabase-mock";

const CLUB = "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5";
const WALLET = "44444444-4444-4444-8444-444444444444";
const OTHER_WALLET = "55555555-5555-4555-8555-555555555555";
const ACTOR = "11111111-1111-4111-8111-111111111111";
let roleName: string;
let db: ReturnType<typeof createSupabaseMock>;
const rpc = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/system-config", () => ({ getAccountingUserIdSync: () => ACTOR }));
vi.mock("@/lib/auth/context", () => ({
  resolveAuthWithRoles: async () => ({
    ok: true,
    context: { supabase: { ...db.client, rpc }, profileId: ACTOR },
    access: buildRoleAccess([{ name: roleName, type: "general", accountingGroupId: null }]),
  }),
}));
const { fetchLedgerTransactions, fetchFinancialAccounts, createTransfer } =
  await import("@/app/(authenticated)/ledger/actions");

beforeEach(() => {
  rpc.mockReset();
  db = createSupabaseMock((call) => {
    switch (call.table) {
      case "accounting_groups": return { data: { id: CLUB, type: "club" } };
      case "transactions": return { data: [{
        id: "33333333-3333-4333-8333-333333333333", date: "2026-05-01", amount: 100,
        description: "Club income", accounting_group_id: CLUB, approval_status: "received",
        created_by: ACTOR, financial_account_id: WALLET, transaction_kind: "income",
      }] };
      case "financial_accounts": return { data: [{ id: WALLET, name: "金庫" }] };
      case "budgets": return { data: { amount: 1000, carryover_amount: 100 } };
      default: return { data: [] };
    }
  });
});

describe.each(["部長", "副部長"])("club ledger for %s", (name) => {
  beforeEach(() => { roleName = name; });

  it("reads club transactions with wallet names, budget and read-only row metadata", async () => {
    const result = await fetchLedgerTransactions({ accountingGroupId: CLUB, fyYear: 2026 });
    expect(result).toMatchObject({
      data: [expect.objectContaining({ description: "Club income", accounting_group_type: "club", financial_account_name: "金庫" })],
      budgetAmount: 1000, carryoverAmount: 100,
    });
    expect(db.calls.map((call) => call.table)).toEqual(expect.arrayContaining([
      "accounting_groups", "transactions", "subsidy_items", "budgets", "financial_accounts",
    ]));
    expect(await fetchFinancialAccounts()).toHaveProperty("data");
  });

  it("rejects transfer creation before calling the write RPC", async () => {
    expect(await createTransfer({ date: "2026-05-01", amount: 100,
      fromAccountId: WALLET, toAccountId: OTHER_WALLET, description: "移動",
    })).toHaveProperty("error");
    expect(rpc).not.toHaveBeenCalled();
  });
});

it("denies club ledger access to a general member before reading transactions", async () => {
  roleName = "一般部員";
  expect(await fetchLedgerTransactions({ accountingGroupId: CLUB, fyYear: 2026 }))
    .toEqual({ error: "アクセス権限がありません" });
  expect(db.calls.map((call) => call.table)).toEqual(["accounting_groups"]);
});
