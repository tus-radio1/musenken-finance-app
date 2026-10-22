import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSupabaseMock,
  eqValue,
  writesTo,
  type QueryCall,
  type QueryResult,
} from "../helpers/supabase-mock";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const APPLICANT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const ITEM_ID = "33333333-3333-4333-8333-333333333333";

// Keys a client must never be able to set through these actions.
const PRIVILEGED_KEYS = {
  status: "approved",
  approved_amount: 999999,
  actual_amount: 999999,
  applicant_id: OTHER_USER_ID,
  fiscal_year_id: 1999,
  deleted_at: "2026-01-01T00:00:00.000Z",
};

let itemStatus: string;
let itemOwner: string;
let isAccounting: boolean;
// Status seen by the write; differs from itemStatus to simulate a concurrent change.
let statusAtWrite: string | null;

function resolveQuery(call: QueryCall): QueryResult {
  if (call.table === "subsidy_items" && call.op === "select") {
    return { data: { status: itemStatus, applicant_id: itemOwner } };
  }
  if (call.table === "subsidy_items" && call.op === "update") {
    const statusFilter = eqValue(call, "status");
    const matches =
      statusFilter === undefined || statusFilter === (statusAtWrite ?? itemStatus);
    return { data: matches ? [{ id: ITEM_ID }] : [] };
  }
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
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/system-config", () => ({
  getAccountingUserIdSync: vi.fn(() => null),
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(async () => userDb.client),
  createAdminClient: vi.fn(() => adminDb.client),
}));
vi.mock("@/lib/auth/context", () => {
  const context = () => ({
    supabase: userDb.client,
    user: { id: APPLICANT_ID },
    userId: APPLICANT_ID,
    profileId: APPLICANT_ID,
    studentNumber: null,
  });
  return {
    resolveAuthContext: vi.fn(async () => ({ ok: true, context: context() })),
    resolveAuthWithRoles: vi.fn(async () => ({
      ok: true,
      context: context(),
      access: {
        roles: [],
        isAdmin: false,
        hasAccountingRole: isAccounting,
        canManageMembers: isAccounting,
        groupRoleTypes: {},
      },
    })),
  };
});

const { updateMySubsidyItem } = await import(
  "@/app/(authenticated)/subsidies/actions"
);
const { updateSubsidyItem } = await import(
  "@/app/(authenticated)/subsidies/manage/actions"
);
const { logAuditEvent } = await import("@/lib/audit-log");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function updatePayloads(db: ReturnType<typeof createSupabaseMock>) {
  return writesTo(db.calls, "subsidy_items")
    .filter((c) => c.op === "update")
    .map((c) => c.payload as Record<string, unknown>);
}

function expectNoPrivilegedKeys(payload: Record<string, unknown>) {
  for (const key of Object.keys(PRIVILEGED_KEYS)) {
    expect(payload).not.toHaveProperty(key);
  }
}

// Server Action arguments arrive untyped from the network; cast to bypass TS.
type MyUpdateValues = Parameters<typeof updateMySubsidyItem>[1];
type ManageUpdates = Parameters<typeof updateSubsidyItem>[1];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(logAuditEvent).mockClear();
  itemStatus = "pending";
  itemOwner = APPLICANT_ID;
  isAccounting = true;
  statusAtWrite = null;
  userDb = createSupabaseMock(resolveQuery);
  adminDb = createSupabaseMock(resolveQuery);
});

// ---------------------------------------------------------------------------
// updateMySubsidyItem (applicant, service-role write)
// ---------------------------------------------------------------------------

describe("updateMySubsidyItem", () => {
  it("drops privileged keys smuggled into a pending update", async () => {
    const values = { name: "New name", ...PRIVILEGED_KEYS } as MyUpdateValues;

    const result = await updateMySubsidyItem(ITEM_ID, values);

    expect(result).toEqual({ success: true });
    const [payload] = updatePayloads(adminDb);
    expect(payload).toEqual({ name: "New name" });
    expectNoPrivilegedKeys(payload);
  });

  it("only writes receipt_url for an approved item", async () => {
    itemStatus = "approved";
    const values = {
      receipt_url: `${APPLICANT_ID}/a.png`,
      name: "ignored",
      ...PRIVILEGED_KEYS,
    } as MyUpdateValues;

    const result = await updateMySubsidyItem(ITEM_ID, values);

    expect(result).toEqual({ success: true });
    expect(updatePayloads(adminDb)).toEqual([{ receipt_url: `${APPLICANT_ID}/a.png` }]);
  });

  it("excludes receipt_url and formats date for a pending item", async () => {
    const result = await updateMySubsidyItem(ITEM_ID, {
      requested_amount: 1200,
      receipt_url: "receipts/a.png",
      date: new Date(2026, 3, 15),
    });

    expect(result).toEqual({ success: true });
    const [payload] = updatePayloads(adminDb);
    expect(payload).not.toHaveProperty("receipt_url");
    expect(payload.requested_amount).toBe(1200);
    expect(payload.date).toBe("2026-04-15");
  });

  it("conditions the write on the status and deletion state it checked", async () => {
    await updateMySubsidyItem(ITEM_ID, { name: "x" });

    const [update] = writesTo(adminDb.calls, "subsidy_items");
    expect(eqValue(update, "status")).toBe("pending");
    expect(update.filters).toContainEqual({ method: "is", args: ["deleted_at", null] });
  });

  it("fails when the item was approved between the check and the write", async () => {
    statusAtWrite = "approved";

    const result = await updateMySubsidyItem(ITEM_ID, { name: "x" });

    expect(result).toEqual({
      error: "申請の状態が変更されたため更新できませんでした。再読み込みしてください",
    });
  });

  it("refuses to edit another applicant's item", async () => {
    itemOwner = OTHER_USER_ID;

    const result = await updateMySubsidyItem(ITEM_ID, { name: "x" });

    expect(result).toEqual({ error: "他人の申請は編集できません" });
    expect(updatePayloads(adminDb)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// updateSubsidyItem (accounting/admin, RLS write)
// ---------------------------------------------------------------------------

describe("updateSubsidyItem (manage)", () => {
  it("writes and audits only schema-validated fields", async () => {
    const updates = {
      approved_amount: 5000,
      remarks: "ok",
      status: "approved",
      fiscal_year_id: 1999,
      deleted_at: "2026-01-01T00:00:00.000Z",
    } as ManageUpdates;

    const result = await updateSubsidyItem(ITEM_ID, updates);

    expect(result).toEqual({ success: true });
    expect(updatePayloads(userDb)).toEqual([
      { approved_amount: 5000, remarks: "ok" },
    ]);
    expect(vi.mocked(logAuditEvent).mock.calls[0][0].newData).toEqual({
      approved_amount: 5000,
      remarks: "ok",
    });
  });

  it("rejects callers without accounting or admin role", async () => {
    isAccounting = false;

    const result = await updateSubsidyItem(ITEM_ID, { remarks: "x" });

    expect(result).toEqual({ error: "権限がありません" });
    expect(updatePayloads(userDb)).toHaveLength(0);
  });
});
