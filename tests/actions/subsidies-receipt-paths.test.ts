import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSupabaseMock,
  writesTo,
  type QueryCall,
  type QueryResult,
} from "../helpers/supabase-mock";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const ITEM_ID = "33333333-3333-4333-8333-333333333333";
const GROUP_ID = "44444444-4444-4444-8444-444444444444";

const OWN_NEW_PATH = `${ACTOR_ID}/new.png`;
const OWN_OLD_PATH = `${ACTOR_ID}/old.png`;
const FOREIGN_PATH = `${OTHER_USER_ID}/theirs.png`;
const PATH_ERROR = "領収書URLの形式が不正です";

// Stored row state and failure switches.
let itemStatus: string;
let storedReceipt: string | null;
let storedEvidence: string | null;
let failUpdate: boolean;
const events: string[] = [];

function resolveQuery(call: QueryCall): QueryResult {
  if (call.table === "fiscal_years") return { data: { year: 2026 } };
  if (call.table !== "subsidy_items") return { error: null };
  if (call.op === "select") {
    return {
      data: {
        status: itemStatus,
        applicant_id: ACTOR_ID,
        receipt_url: storedReceipt,
        evidence_url: storedEvidence,
      },
    };
  }
  if (call.op === "update") {
    if (failUpdate) return { error: { message: "update failed" } };
    events.push("update");
    return { data: [{ id: ITEM_ID }] };
  }
  if (call.op === "insert") events.push("insert");
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
vi.mock("@/lib/receipt-storage", () => ({
  removeReplacedReceipt: vi.fn(async ({ oldPath }: { oldPath: string }) => {
    events.push(`remove:${oldPath}`);
  }),
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
      access: {
        roles: [],
        isAdmin: false,
        hasAccountingRole: true,
        canManageMembers: true,
        groupRoleTypes: {},
      },
    })),
  };
});

const { createSubsidyItem, updateMySubsidyItem } = await import(
  "@/app/(authenticated)/subsidies/actions"
);
const { updateSubsidyItem } = await import(
  "@/app/(authenticated)/subsidies/manage/actions"
);
const { removeReplacedReceipt } = await import("@/lib/receipt-storage");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function updatePayload(db: ReturnType<typeof createSupabaseMock>) {
  const update = writesTo(db.calls, "subsidy_items").find((c) => c.op === "update");
  return update?.payload as Record<string, unknown> | undefined;
}

const NEW_ITEM = {
  category: "activity" as const,
  term: 1,
  expense_type: "equipment" as const,
  income_type: "expense" as const,
  date: new Date(2026, 3, 15),
  accounting_group_id: GROUP_ID,
  name: "Item",
  requested_amount: 1000,
  justification: "reason",
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(removeReplacedReceipt).mockClear();
  events.length = 0;
  itemStatus = "pending";
  storedReceipt = null;
  storedEvidence = OWN_OLD_PATH;
  failUpdate = false;
  userDb = createSupabaseMock(resolveQuery);
  adminDb = createSupabaseMock(resolveQuery);
});

// ---------------------------------------------------------------------------
// createSubsidyItem
// ---------------------------------------------------------------------------

describe("createSubsidyItem evidence_url ownership", () => {
  it.each([
    ["another user's prefix", FOREIGN_PATH],
    ["an external URL", "https://evil.example/x.png"],
    ["a traversal path", `${ACTOR_ID}/../${OTHER_USER_ID}/x.png`],
  ])("rejects %s", async (_label, evidenceUrl) => {
    const result = await createSubsidyItem({ ...NEW_ITEM, evidence_url: evidenceUrl });

    expect(result).toEqual({ error: PATH_ERROR });
    expect(events).not.toContain("insert");
  });

  it("accepts an object under the caller's own prefix", async () => {
    const result = await createSubsidyItem({ ...NEW_ITEM, evidence_url: OWN_NEW_PATH });

    expect(result).toEqual({ success: true });
    expect(events).toContain("insert");
  });
});

// ---------------------------------------------------------------------------
// updateMySubsidyItem
// ---------------------------------------------------------------------------

describe("updateMySubsidyItem receipt / evidence paths", () => {
  it("rejects a foreign evidence_url on a pending item without writing", async () => {
    const result = await updateMySubsidyItem(ITEM_ID, { evidence_url: FOREIGN_PATH });

    expect(result).toEqual({ error: PATH_ERROR });
    expect(updatePayload(adminDb)).toBeUndefined();
    expect(removeReplacedReceipt).not.toHaveBeenCalled();
  });

  it("rejects a foreign receipt_url on an approved item without writing", async () => {
    itemStatus = "approved";

    const result = await updateMySubsidyItem(ITEM_ID, { receipt_url: FOREIGN_PATH });

    expect(result).toEqual({ error: PATH_ERROR });
    expect(updatePayload(adminDb)).toBeUndefined();
  });

  it("removes the old evidence (read from the DB) only after the update", async () => {
    const result = await updateMySubsidyItem(ITEM_ID, { evidence_url: OWN_NEW_PATH });

    expect(result).toEqual({ success: true });
    expect(events).toEqual(["update", `remove:${OWN_OLD_PATH}`]);
    expect(removeReplacedReceipt).toHaveBeenCalledWith({
      oldPath: OWN_OLD_PATH,
      newPath: OWN_NEW_PATH,
      actorUserId: ACTOR_ID,
    });
  });

  it("removes the old receipt after an approved item's receipt is replaced", async () => {
    itemStatus = "approved";
    storedReceipt = OWN_OLD_PATH;

    const result = await updateMySubsidyItem(ITEM_ID, { receipt_url: OWN_NEW_PATH });

    expect(result).toEqual({ success: true });
    expect(events).toEqual(["update", `remove:${OWN_OLD_PATH}`]);
  });

  it("keeps an unchanged legacy path and does not clean anything up", async () => {
    storedEvidence = "legacy-upload.png";

    const result = await updateMySubsidyItem(ITEM_ID, {
      name: "x",
      evidence_url: "legacy-upload.png",
    });

    expect(result).toEqual({ success: true });
    expect(removeReplacedReceipt).not.toHaveBeenCalled();
  });

  it("does not clean up when the update fails", async () => {
    failUpdate = true;

    const result = await updateMySubsidyItem(ITEM_ID, { evidence_url: OWN_NEW_PATH });

    expect(result).toHaveProperty("error");
    expect(removeReplacedReceipt).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateSubsidyItem (manage)
// ---------------------------------------------------------------------------

describe("updateSubsidyItem receipt / evidence paths", () => {
  it("rejects a receipt_url outside the editor's prefix without writing", async () => {
    const result = await updateSubsidyItem(ITEM_ID, { receipt_url: FOREIGN_PATH });

    expect(result).toEqual({ error: PATH_ERROR });
    expect(updatePayload(userDb)).toBeUndefined();
  });

  it("rejects an evidence_url outside the editor's prefix without writing", async () => {
    const result = await updateSubsidyItem(ITEM_ID, { evidence_url: FOREIGN_PATH });

    expect(result).toEqual({ error: PATH_ERROR });
    expect(updatePayload(userDb)).toBeUndefined();
  });

  it("removes the replaced receipt (read from the DB) only after the update", async () => {
    storedReceipt = OWN_OLD_PATH;

    const result = await updateSubsidyItem(ITEM_ID, { receipt_url: OWN_NEW_PATH });

    expect(result).toEqual({ success: true });
    expect(events).toEqual(["update", `remove:${OWN_OLD_PATH}`]);
  });

  it("keeps the stored evidence when the form resubmits it unchanged", async () => {
    storedEvidence = FOREIGN_PATH;

    const result = await updateSubsidyItem(ITEM_ID, {
      remarks: "ok",
      evidence_url: FOREIGN_PATH,
    });

    expect(result).toEqual({ success: true });
    expect(removeReplacedReceipt).not.toHaveBeenCalled();
  });

  it('treats "" from the form as no file', async () => {
    const result = await updateSubsidyItem(ITEM_ID, { receipt_url: "" });

    expect(result).toEqual({ success: true });
    expect(updatePayload(userDb)?.receipt_url).toBeNull();
    expect(removeReplacedReceipt).not.toHaveBeenCalled();
  });

  it("does not clean up when the update fails", async () => {
    storedReceipt = OWN_OLD_PATH;
    failUpdate = true;

    const result = await updateSubsidyItem(ITEM_ID, { receipt_url: OWN_NEW_PATH });

    expect(result).toHaveProperty("error");
    expect(removeReplacedReceipt).not.toHaveBeenCalled();
  });
});
