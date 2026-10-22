import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSupabaseMock,
  eqValue,
  hasFilter,
  writesTo,
  type QueryCall,
  type QueryResult,
} from "../helpers/supabase-mock";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const TX_ID = "33333333-3333-4333-8333-333333333333";
const FINANCIAL_ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";

// G1 / G2 are restricted (type "leader") groups, OPEN is visible to everyone,
// CLUB is the club-wide ledger.
const G1 = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const G2 = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
const G3 = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";
const OPEN = "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4";
const CLUB = "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5";

const GROUP_TYPES: Record<string, string | null> = {
  [G1]: "leader",
  [G2]: "leader",
  [G3]: "leader",
  [OPEN]: "general",
  [CLUB]: "club",
};

const CURRENT_FY = 2026;
const PAST_FY = 2025;

type Actor = "member" | "leader" | "accounting" | "admin" | "outsider";

type Role = {
  name: string;
  type: string;
  accountingGroupId: string | null;
};

const ACTOR_ROLES: Record<Actor, Role[]> = {
  member: [{ name: "general", type: "general", accountingGroupId: G1 }],
  leader: [{ name: "leader", type: "leader", accountingGroupId: G1 }],
  accounting: [{ name: "会計", type: "accounting", accountingGroupId: null }],
  admin: [{ name: "Local Admin", type: "admin", accountingGroupId: null }],
  outsider: [{ name: "general", type: "general", accountingGroupId: G2 }],
};

function accessFor(actor: Actor) {
  const roles = ACTOR_ROLES[actor];
  const groupRoleTypes: Record<string, string[]> = {};
  for (const r of roles) {
    if (r.accountingGroupId) {
      groupRoleTypes[r.accountingGroupId] = [
        ...(groupRoleTypes[r.accountingGroupId] ?? []),
        r.type,
      ];
    }
  }
  const isAdmin = roles.some((r) => r.type === "admin");
  const hasAccountingRole = roles.some((r) => r.name === "会計");
  return {
    roles,
    isAdmin,
    hasAccountingRole,
    canManageMembers: isAdmin || hasAccountingRole,
    groupRoleTypes,
  };
}

type TxRow = {
  accounting_group_id: string;
  created_by: string;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  amount: number;
  receipt_url: string | null;
  description: string;
  fiscal_year_id: number | null;
};

let actor: Actor;
let tx: TxRow;
// Rows the UPDATE / DELETE on transactions reports back (RLS can filter to []).
let writtenRows: Array<{ id: string }>;

function resolveQuery(call: QueryCall): QueryResult {
  switch (call.table) {
    case "transactions":
      if (call.op === "select") return { data: tx };
      if (call.op === "update" || call.op === "delete") {
        return { data: writtenRows };
      }
      return { error: null };
    case "accounting_groups": {
      const id = eqValue(call, "id") as string;
      return id in GROUP_TYPES
        ? { data: { id, type: GROUP_TYPES[id] } }
        : { data: null };
    }
    case "fiscal_years": {
      const year = eqValue(call, "year");
      if (typeof year === "number") {
        return { data: { year, is_current: year === CURRENT_FY } };
      }
      return { data: { year: CURRENT_FY, is_current: true } };
    }
    case "financial_accounts":
      return { data: { id: FINANCIAL_ACCOUNT_ID } };
    default:
      return { error: null };
  }
}

let userDb: ReturnType<typeof createSupabaseMock>;
let adminDb: ReturnType<typeof createSupabaseMock>;

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/audit-log", () => ({
  logAuditEvent: vi.fn(async () => undefined),
  recordAuditEvent: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/system-config", () => ({
  ACCOUNTING_USER_ID_FALLBACK: "00000000-0000-4000-8000-000000000000",
  getAccountingUserId: vi.fn(async () => "00000000-0000-4000-8000-000000000000"),
  getAccountingUserIdSync: vi.fn(() => "00000000-0000-4000-8000-000000000000"),
}));
vi.mock("@/lib/receipt-storage", () => ({
  removeReplacedReceipt: vi.fn(async () => undefined),
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(async () => userDb.client),
  createAdminClient: vi.fn(() => adminDb.client),
}));
vi.mock("@/lib/auth/context", () => {
  const context = () => ({
    supabase: userDb.client,
    user: { id: ACTOR_ID },
    userId: ACTOR_ID,
    profileId: ACTOR_ID,
    studentNumber: null,
  });
  return {
    resolveAuthContext: vi.fn(async () => ({ ok: true, context: context() })),
    resolveAuthWithRoles: vi.fn(async () => ({
      ok: true,
      context: context(),
      access: accessFor(actor),
    })),
  };
});

const {
  createTransaction,
  updateTransactionStatus,
  updateTransaction,
  deleteTransaction,
} = await import("@/app/actions");
const { logAuditEvent, recordAuditEvent } = await import("@/lib/audit-log");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function txWrites(op: "insert" | "update" | "delete") {
  return writesTo(userDb.calls, "transactions").filter((c) => c.op === op);
}

function formValues(overrides: Record<string, unknown> = {}) {
  return {
    date: new Date("2026-05-01T00:00:00+09:00"),
    amount: 1000,
    type: "expense" as const,
    accounting_group_id: tx.accounting_group_id,
    financial_account_id: FINANCIAL_ACCOUNT_ID,
    description: tx.description,
    remarks: null,
    created_by: tx.created_by,
    approved_by: tx.approved_by,
    approval_status: tx.approval_status as "pending",
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(logAuditEvent).mockClear();
  vi.mocked(recordAuditEvent).mockClear();
  vi.mocked(recordAuditEvent).mockResolvedValue({ ok: true });
  actor = "admin";
  tx = {
    accounting_group_id: G1,
    created_by: OTHER_USER_ID,
    approval_status: "pending",
    approved_by: null,
    approved_at: null,
    rejected_reason: null,
    amount: -1000,
    receipt_url: null,
    description: "Original",
    fiscal_year_id: CURRENT_FY,
  };
  writtenRows = [{ id: TX_ID }];
  userDb = createSupabaseMock(resolveQuery);
  adminDb = createSupabaseMock(resolveQuery);
});

// ---------------------------------------------------------------------------
// updateTransactionStatus (approval flow)
// ---------------------------------------------------------------------------

describe("updateTransactionStatus", () => {
  // Bug (item 5): the UI shows approval buttons to 会計, the server rejected them.
  it("lets 会計 approve another member's pending transaction", async () => {
    actor = "accounting";

    const result = await updateTransactionStatus(TX_ID, "approved");

    expect(result).toEqual({ success: true });
    const [update] = txWrites("update");
    expect(update.payload).toMatchObject({
      approval_status: "approved",
      approved_by: ACTOR_ID,
    });
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
  });

  // Bug (item 5, D1): leaders passed the server check and got a false success
  // (RLS filters the UPDATE to 0 rows).
  it("rejects a group leader without writing anything", async () => {
    actor = "leader";
    writtenRows = [];

    const result = await updateTransactionStatus(TX_ID, "approved");

    expect(result).toHaveProperty("error");
    expect(txWrites("update")).toHaveLength(0);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  // Bug (item 5/6): an UPDATE that touched 0 rows was reported as success and
  // audited.
  it("returns an error and skips the audit when no row was updated", async () => {
    writtenRows = [];

    const result = await updateTransactionStatus(TX_ID, "approved");

    expect(result).toHaveProperty("error");
    expect(result).not.toHaveProperty("success");
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects self-approval by an admin", async () => {
    tx = { ...tx, created_by: ACTOR_ID };

    const result = await updateTransactionStatus(TX_ID, "approved");

    expect(result).toEqual({ error: "自分の申請を承認することはできません" });
    expect(txWrites("update")).toHaveLength(0);
  });

  it("rejects self-approval by 会計", async () => {
    actor = "accounting";
    tx = { ...tx, created_by: ACTOR_ID };

    const result = await updateTransactionStatus(TX_ID, "approved");

    expect(result).toEqual({ error: "自分の申請を承認することはできません" });
    expect(txWrites("update")).toHaveLength(0);
  });

  it("limits past fiscal years to admins (D7)", async () => {
    tx = { ...tx, fiscal_year_id: PAST_FY };
    actor = "accounting";

    const denied = await updateTransactionStatus(TX_ID, "approved");
    expect(denied).toEqual({ error: "過年度の申請は管理者のみ承認できます" });
    expect(txWrites("update")).toHaveLength(0);

    actor = "admin";
    const allowed = await updateTransactionStatus(TX_ID, "approved");
    expect(allowed).toEqual({ success: true });
  });

  it("writes only a still-pending row and clears the rejection reason", async () => {
    const result = await updateTransactionStatus(TX_ID, "approved", "ignored");

    expect(result).toEqual({ success: true });
    const [update] = txWrites("update");
    expect(eqValue(update, "approval_status")).toBe("pending");
    expect(eqValue(update, "created_by")).toBe(OTHER_USER_ID);
    expect(hasFilter(update, "is", "deleted_at")).toBe(true);
    expect(update.payload).toMatchObject({ rejected_reason: null });
  });

  it("stores the reason of a rejection", async () => {
    const result = await updateTransactionStatus(TX_ID, "rejected", "領収書なし");

    expect(result).toEqual({ success: true });
    expect(txWrites("update")[0].payload).toMatchObject({
      approval_status: "rejected",
      rejected_reason: "領収書なし",
    });
  });

  // Bug (item 5): the current status was not required to be pending.
  it("does not decide a transaction that is no longer pending", async () => {
    tx = { ...tx, approval_status: "approved", approved_by: OTHER_USER_ID };

    const result = await updateTransactionStatus(TX_ID, "rejected");

    expect(result).toHaveProperty("error");
    expect(txWrites("update")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// updateTransaction (edit form)
// ---------------------------------------------------------------------------

describe("updateTransaction", () => {
  // Bug (item 6, D6): leaders were allowed to edit other members' rows, which
  // RLS silently filtered to 0 rows.
  it("rejects a leader editing another member's transaction", async () => {
    actor = "leader";
    writtenRows = [];

    const result = await updateTransaction(TX_ID, formValues({ description: "x" }));

    expect(result).toHaveProperty("error");
    expect(txWrites("update")).toHaveLength(0);
  });

  // Bug (item 5, D3): 会計 could approve their own transaction via the edit form.
  it("rejects 会計 changing the approval status of their own row", async () => {
    actor = "accounting";
    tx = { ...tx, created_by: ACTOR_ID };

    const result = await updateTransaction(
      TX_ID,
      formValues({ approval_status: "approved" }),
    );

    expect(result).toHaveProperty("error");
    expect(txWrites("update")).toHaveLength(0);
  });

  it("lets 会計 save a content edit of their own row with the unchanged status", async () => {
    actor = "accounting";
    tx = { ...tx, created_by: ACTOR_ID, approval_status: "approved", approved_by: OTHER_USER_ID };

    const result = await updateTransaction(TX_ID, formValues({ description: "Edited" }));

    expect(result).toEqual({ success: true });
    const [update] = txWrites("update");
    expect(update.payload).toMatchObject({ description: "Edited" });
    expect(update.payload).not.toHaveProperty("approval_status");
    expect(update.payload).not.toHaveProperty("approved_by");
  });

  it("makes 会計 the approver when they approve another member's row", async () => {
    actor = "accounting";

    const result = await updateTransaction(
      TX_ID,
      formValues({ approval_status: "approved" }),
    );

    expect(result).toEqual({ success: true });
    expect(txWrites("update")[0].payload).toMatchObject({
      approval_status: "approved",
      approved_by: ACTOR_ID,
      rejected_reason: null,
    });
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects 会計 changing the status of a past fiscal year's row", async () => {
    actor = "accounting";
    tx = { ...tx, fiscal_year_id: PAST_FY };

    const result = await updateTransaction(
      TX_ID,
      formValues({ approval_status: "approved" }),
    );

    expect(result).toEqual({ error: "過年度の承認ステータスは管理者のみ変更できます" });
    expect(txWrites("update")).toHaveLength(0);
  });

  it("lets an admin correct the status of their own row and audits it (break-glass)", async () => {
    tx = { ...tx, created_by: ACTOR_ID };

    const result = await updateTransaction(
      TX_ID,
      formValues({ approval_status: "approved" }),
    );

    expect(result).toEqual({ success: true });
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    const intent = vi.mocked(recordAuditEvent).mock.calls[0][0];
    expect(intent).toMatchObject({
      tableName: "transactions",
      recordId: TX_ID,
      changedBy: ACTOR_ID,
      oldData: { approval_status: "pending", approved_by: null },
      newData: {
        approval_status: "approved",
        approved_by: ACTOR_ID,
        break_glass: "admin_self_row_correction",
        phase: "intent",
      },
    });
    expect(txWrites("update")).toHaveLength(1);
    expect(vi.mocked(logAuditEvent).mock.calls[0][0].newData).toMatchObject({
      break_glass: "admin_self_row_correction",
    });
  });

  it("aborts the admin self-row correction when the audit row cannot be written", async () => {
    tx = { ...tx, created_by: ACTOR_ID };
    vi.mocked(recordAuditEvent).mockResolvedValueOnce({ ok: false });

    const result = await updateTransaction(
      TX_ID,
      formValues({ approval_status: "approved" }),
    );

    expect(result).toEqual({
      error: "監査ログを記録できなかったため、変更を中止しました",
    });
    expect(txWrites("update")).toHaveLength(0);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("does not require the break-glass audit for an admin editing another member's row", async () => {
    const result = await updateTransaction(
      TX_ID,
      formValues({ approval_status: "rejected" }),
    );

    expect(result).toEqual({ success: true });
    expect(recordAuditEvent).not.toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
  });

  it("returns an error and skips the audit when no row was updated", async () => {
    writtenRows = [];

    const result = await updateTransaction(TX_ID, formValues({ description: "x" }));

    expect(result).toHaveProperty("error");
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("keeps a member's own non-pending transaction read-only", async () => {
    actor = "member";
    tx = { ...tx, created_by: ACTOR_ID, approval_status: "approved" };

    const result = await updateTransaction(TX_ID, formValues({ description: "x" }));

    expect(result).toEqual({ error: "受付中以外のデータは編集できません" });
    expect(txWrites("update")).toHaveLength(0);
  });

  it("lets a member edit their own pending transaction in their group", async () => {
    actor = "member";
    tx = { ...tx, created_by: ACTOR_ID };

    const result = await updateTransaction(
      TX_ID,
      formValues({ description: "Edited", approval_status: "approved" }),
    );

    expect(result).toEqual({ success: true });
    const [update] = txWrites("update");
    expect(update.payload).not.toHaveProperty("approval_status");
    expect(eqValue(update, "approval_status")).toBe("pending");
  });

  // Bug (item 4): the destination group was never authorized.
  it("rejects a member moving their transaction to an unrelated group", async () => {
    actor = "member";
    tx = { ...tx, created_by: ACTOR_ID };

    const result = await updateTransaction(
      TX_ID,
      formValues({ accounting_group_id: G3 }),
    );

    expect(result).toHaveProperty("error");
    expect(txWrites("update")).toHaveLength(0);
  });
});

describe("updateTransaction destination group (item 4)", () => {
  it("keeps a legacy row editable when the group is unchanged", async () => {
    actor = "accounting";
    tx = { ...tx, accounting_group_id: "f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6" };

    const result = await updateTransaction(TX_ID, formValues({ description: "x" }));

    expect(result).toEqual({ success: true });
    expect(userDb.calls.some((c) => c.table === "accounting_groups")).toBe(false);
  });

  it("lets a member move their pending transaction to an open group", async () => {
    actor = "member";
    tx = { ...tx, created_by: ACTOR_ID };

    const result = await updateTransaction(
      TX_ID,
      formValues({ accounting_group_id: OPEN }),
    );

    expect(result).toEqual({ success: true });
    expect(txWrites("update")[0].payload).toMatchObject({ accounting_group_id: OPEN });
  });

  it("rejects moving into the club ledger without 会計 or admin rights", async () => {
    actor = "member";
    tx = { ...tx, created_by: ACTOR_ID };

    const result = await updateTransaction(
      TX_ID,
      formValues({ accounting_group_id: CLUB }),
    );

    expect(result).toEqual({
      error: "部全体取引の作成には会計担当または管理者権限が必要です",
    });
    expect(txWrites("update")).toHaveLength(0);
  });

  it("denies the move when the destination group cannot be found", async () => {
    actor = "accounting";

    const result = await updateTransaction(
      TX_ID,
      formValues({ accounting_group_id: "f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6" }),
    );

    expect(result).toEqual({ error: "会計グループが見つかりません" });
    expect(txWrites("update")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createTransaction
// ---------------------------------------------------------------------------

describe("createTransaction", () => {
  // Bug (item 4): only the club case was checked, not group membership.
  it("rejects filing into a restricted group the user has no role in", async () => {
    actor = "outsider";

    const result = await createTransaction(
      formValues({ accounting_group_id: G1 }),
      null,
      TX_ID,
    );

    expect(result).toHaveProperty("error");
    expect(txWrites("insert")).toHaveLength(0);
  });

  it("lets a member file into their own group and open groups", async () => {
    actor = "member";

    for (const group of [G1, OPEN]) {
      const result = await createTransaction(
        formValues({ accounting_group_id: group }),
        null,
        TX_ID,
      );
      expect(result).toEqual({ success: true });
    }
    expect(txWrites("insert")).toHaveLength(2);
  });

  it("lets 会計 file into the club ledger but not a leader", async () => {
    actor = "accounting";
    expect(
      await createTransaction(formValues({ accounting_group_id: CLUB }), null, TX_ID),
    ).toEqual({ success: true });

    actor = "leader";
    expect(
      await createTransaction(formValues({ accounting_group_id: CLUB }), null, TX_ID),
    ).toEqual({ error: "部全体取引の作成には会計担当または管理者権限が必要です" });
  });

  it("denies filing when the group lookup fails", async () => {
    actor = "admin";
    userDb = createSupabaseMock((call) =>
      call.table === "accounting_groups"
        ? { error: { message: "db down" } }
        : resolveQuery(call),
    );

    const result = await createTransaction(formValues(), null, TX_ID);

    expect(result).toEqual({ error: "会計グループの取得に失敗しました" });
    expect(txWrites("insert")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// deleteTransaction
// ---------------------------------------------------------------------------

describe("deleteTransaction", () => {
  // Bug (item 6): a DELETE that removed 0 rows was reported as success.
  it("returns an error and skips the audit when no row was deleted", async () => {
    writtenRows = [];

    const result = await deleteTransaction(TX_ID);

    expect(result).toHaveProperty("error");
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("deletes an owner's pending transaction and audits it", async () => {
    actor = "member";
    tx = { ...tx, created_by: ACTOR_ID };

    const result = await deleteTransaction(TX_ID);

    expect(result).toEqual({ success: true });
    expect(txWrites("delete")).toHaveLength(1);
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
  });
});
