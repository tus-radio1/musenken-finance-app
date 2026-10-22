import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSupabaseMock,
  eqValue,
  writesTo,
  type QueryCall,
  type QueryResult,
} from "../helpers/supabase-mock";

// Writes that RLS can filter to 0 rows must not be reported as success.

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "33333333-3333-4333-8333-333333333333";

type Actor = "member" | "accounting" | "admin";

function accessFor(actor: Actor) {
  const roles =
    actor === "admin"
      ? [{ name: "Local Admin", type: "admin", accountingGroupId: null }]
      : actor === "accounting"
        ? [{ name: "会計", type: "accounting", accountingGroupId: null }]
        : [];
  return {
    roles,
    isAdmin: actor === "admin",
    hasAccountingRole: actor === "accounting",
    canManageMembers: actor !== "member",
    groupRoleTypes: {},
  };
}

let actor: Actor;
// Rows the subsidy_items write reports back (RLS can filter to []).
let writtenRows: Array<{ id: string }>;
// Transactions linked to the subsidy item, and how many a DELETE removes.
let linkedCount: number;
let deletedLinkedRows: Array<{ id: string }>;

function resolveQuery(call: QueryCall): QueryResult {
  if (call.table === "subsidy_items" && call.op === "select") {
    return {
      data: {
        status: "pending",
        applicant_id: ACTOR_ID,
        receipt_url: null,
        evidence_url: null,
      },
    };
  }
  if (call.table === "subsidy_items") return { data: writtenRows };
  if (call.table === "transactions" && call.op === "select") {
    return { data: null, count: linkedCount };
  }
  if (call.table === "transactions") return { data: deletedLinkedRows };
  return { error: null };
}

let userDb: ReturnType<typeof createSupabaseMock>;
let adminDb: ReturnType<typeof createSupabaseMock>;

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/audit-log", () => ({
  logAuditEvent: vi.fn(async () => undefined),
  recordAuditEvent: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/system-config", () => ({
  getAccountingUserIdSync: vi.fn(() => null),
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

const { deleteMySubsidyItem } = await import(
  "@/app/(authenticated)/subsidies/actions"
);
const { updateSubsidyStatus, updateSubsidyItem, deleteSubsidyItem } =
  await import("@/app/(authenticated)/subsidies/manage/actions");
const { logAuditEvent } = await import("@/lib/audit-log");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(logAuditEvent).mockClear();
  actor = "accounting";
  writtenRows = [];
  linkedCount = 0;
  deletedLinkedRows = [];
  userDb = createSupabaseMock(resolveQuery);
  adminDb = createSupabaseMock(resolveQuery);
});

describe("0-row subsidy writes", () => {
  // Bug (item 6): no owner DELETE policy, so the hard delete removed nothing.
  it("deleteMySubsidyItem reports an error when nothing was deleted", async () => {
    actor = "member";

    const result = await deleteMySubsidyItem(ITEM_ID);

    expect(result).toHaveProperty("error");
  });

  it("updateSubsidyStatus reports an error and skips the audit", async () => {
    const result = await updateSubsidyStatus(ITEM_ID, "approved");

    expect(result).toHaveProperty("error");
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("updateSubsidyItem reports an error and skips the audit", async () => {
    const result = await updateSubsidyItem(ITEM_ID, { name: "Renamed" });

    expect(result).toHaveProperty("error");
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("deleteSubsidyItem reports an error and skips the audit", async () => {
    actor = "admin";

    const result = await deleteSubsidyItem(ITEM_ID);

    expect(result).toHaveProperty("error");
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe("successful subsidy writes", () => {
  it("lets an applicant hard-delete their own pending item", async () => {
    actor = "member";
    writtenRows = [{ id: ITEM_ID }];

    const result = await deleteMySubsidyItem(ITEM_ID);

    expect(result).toEqual({ success: true });
    const [del] = writesTo(userDb.calls, "subsidy_items");
    expect(del.op).toBe("delete");
    expect(eqValue(del, "applicant_id")).toBe(ACTOR_ID);
    expect(eqValue(del, "status")).toBe("pending");
  });

  it("audits a status update that changed one row", async () => {
    writtenRows = [{ id: ITEM_ID }];

    const result = await updateSubsidyStatus(ITEM_ID, "approved");

    expect(result).toEqual({ success: true });
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
  });
});

describe("updateSubsidyStatus to unexecuted", () => {
  it("stops 会計 before any write when linked transactions exist", async () => {
    writtenRows = [{ id: ITEM_ID }];
    linkedCount = 2;

    const result = await updateSubsidyStatus(ITEM_ID, "unexecuted");

    expect(result).toEqual({
      error: "出納帳に関連データがあるため、管理者に操作を依頼してください",
    });
    expect(writesTo(userDb.calls, "subsidy_items")).toHaveLength(0);
    expect(writesTo(userDb.calls, "transactions")).toHaveLength(0);
  });

  it("lets 会計 mark an item without linked transactions as unexecuted", async () => {
    writtenRows = [{ id: ITEM_ID }];

    const result = await updateSubsidyStatus(ITEM_ID, "unexecuted");

    expect(result).toEqual({ success: true });
    expect(writesTo(userDb.calls, "transactions")).toHaveLength(0);
  });

  it("reports a partial delete of linked transactions", async () => {
    actor = "admin";
    writtenRows = [{ id: ITEM_ID }];
    linkedCount = 2;
    deletedLinkedRows = [{ id: "tx-1" }];

    const result = await updateSubsidyStatus(ITEM_ID, "unexecuted");

    expect(result).toEqual({
      error:
        "ステータスは更新しましたが、関連する出納帳データの一部を削除できませんでした",
    });
  });

  it("deletes all linked transactions for an admin", async () => {
    actor = "admin";
    writtenRows = [{ id: ITEM_ID }];
    linkedCount = 2;
    deletedLinkedRows = [{ id: "tx-1" }, { id: "tx-2" }];

    const result = await updateSubsidyStatus(ITEM_ID, "unexecuted");

    expect(result).toEqual({ success: true });
    // One audit row for the status, one per deleted transaction.
    expect(logAuditEvent).toHaveBeenCalledTimes(3);
  });
});
