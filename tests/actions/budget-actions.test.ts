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

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const GROUP_ID = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const BUDGET_ID = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";

const CURRENT_FY = 2026;
const PAST_FY = 2025;
const KNOWN_YEARS = [PAST_FY, CURRENT_FY];

type Actor = "admin" | "accounting" | "leader";

const ACTOR_ROLES: Record<
  Actor,
  Array<{ name: string; type: string; accountingGroupId: string | null }>
> = {
  admin: [{ name: "Local Admin", type: "admin", accountingGroupId: null }],
  accounting: [{ name: "会計", type: "accounting", accountingGroupId: null }],
  leader: [{ name: "leader", type: "leader", accountingGroupId: GROUP_ID }],
};

function accessFor(actor: Actor) {
  const roles = ACTOR_ROLES[actor];
  const groupRoleTypes: Record<string, string[]> = {};
  for (const r of roles) {
    if (r.accountingGroupId) groupRoleTypes[r.accountingGroupId] = [r.type];
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

let actor: Actor;
let existingBudget: { id: string } | null;
let budgetWriteRows: Array<{ id: string }>;
let groupWriteRows: Array<{ id: string }>;

function resolveQuery(call: QueryCall): QueryResult {
  if (call.table === "fiscal_years" && call.op === "select") {
    const year = eqValue(call, "year");
    if (typeof year === "number") {
      return KNOWN_YEARS.includes(year)
        ? { data: { year, is_current: year === CURRENT_FY } }
        : { data: null };
    }
    return { data: { year: CURRENT_FY, is_current: true } };
  }
  if (call.table === "budgets" && call.op === "select") {
    return { data: existingBudget };
  }
  if (call.table === "budgets") {
    return { data: budgetWriteRows };
  }
  if (call.table === "accounting_groups") {
    return { data: call.op === "insert" ? groupWriteRows[0] : groupWriteRows };
  }
  return { error: null };
}

let userDb: ReturnType<typeof createSupabaseMock>;
let adminDb: ReturnType<typeof createSupabaseMock>;

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
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

const { upsertBudget, toggleAccountingGroupActive, createAccountingGroup,
  deleteGroupYearData, createFiscalYearBudgets } = await import(
  "@/app/(authenticated)/budget/actions"
);

function budgetWrites() {
  return writesTo(adminDb.calls, "budgets");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  actor = "admin";
  existingBudget = null;
  budgetWriteRows = [{ id: BUDGET_ID }];
  groupWriteRows = [{ id: GROUP_ID }];
  userDb = createSupabaseMock(resolveQuery);
  adminDb = createSupabaseMock(resolveQuery);
});

// ---------------------------------------------------------------------------
// upsertBudget (R5)
// ---------------------------------------------------------------------------

describe("upsertBudget", () => {
  // Bug (R5): the page shows the edit dialog to 会計, the server rejected it.
  it("lets 会計 set the current fiscal year's budget", async () => {
    actor = "accounting";

    const result = await upsertBudget(GROUP_ID, 5000, CURRENT_FY);

    expect(result).toEqual({ success: true });
    expect(budgetWrites()).toHaveLength(1);
  });

  // Bug (R5, D4): the server let group leaders edit their group's budget.
  it("rejects a group leader", async () => {
    actor = "leader";

    const result = await upsertBudget(GROUP_ID, 5000, CURRENT_FY);

    expect(result).toHaveProperty("error");
    expect(budgetWrites()).toHaveLength(0);
  });

  it("lets admins edit a past fiscal year", async () => {
    const result = await upsertBudget(GROUP_ID, 5000, PAST_FY);

    expect(result).toEqual({ success: true });
    expect(budgetWrites()[0].payload).toMatchObject({ fiscal_year_id: PAST_FY });
  });

  it("rejects 会計 editing a past fiscal year", async () => {
    actor = "accounting";

    const result = await upsertBudget(GROUP_ID, 5000, PAST_FY);

    expect(result).toEqual({ error: "予算の編集権限がありません" });
    expect(budgetWrites()).toHaveLength(0);
  });

  it("rejects an unknown fiscal year", async () => {
    const result = await upsertBudget(GROUP_ID, 5000, 2030);

    expect(result).toEqual({ error: "会計年度が未設定です" });
    expect(budgetWrites()).toHaveLength(0);
  });

  it("uses the current fiscal year resolved on the server when none is given", async () => {
    actor = "accounting";

    const result = await upsertBudget(GROUP_ID, 5000);

    expect(result).toEqual({ success: true });
    expect(budgetWrites()[0].payload).toMatchObject({ fiscal_year_id: CURRENT_FY });
  });

  it("reports an error when the update of an existing budget touched no row", async () => {
    existingBudget = { id: BUDGET_ID };
    budgetWriteRows = [];

    const result = await upsertBudget(GROUP_ID, 5000, CURRENT_FY);

    expect(result).toEqual({ error: "予算の保存に失敗しました" });
    expect(budgetWrites()[0].op).toBe("update");
  });
});

describe("toggleAccountingGroupActive", () => {
  it("toggles a group for an admin", async () => {
    const result = await toggleAccountingGroupActive(GROUP_ID, false);

    expect(result).toEqual({ success: true });
  });

  // Review finding: a missing group (0 rows) was reported as success.
  it("reports an error when no group was updated", async () => {
    groupWriteRows = [];

    const result = await toggleAccountingGroupActive(GROUP_ID, false);

    expect(result).toEqual({ error: "対象の会計グループが見つかりません" });
  });

  it("lets non-admin 会計 toggle a group", async () => {
    actor = "accounting";

    const result = await toggleAccountingGroupActive(GROUP_ID, false);

    expect(result).toEqual({ success: true });
    expect(writesTo(adminDb.calls, "accounting_groups")).toHaveLength(1);
  });
});

describe("accounting group management preserves D4", () => {
  beforeEach(() => { actor = "accounting"; });

  it("creates a group with a current-year budget", async () => {
    expect(await createAccountingGroup("New group", "general", CURRENT_FY, 1000))
      .toEqual({ success: true, groupId: GROUP_ID });
    expect(budgetWrites()[0].payload).toMatchObject({ fiscal_year_id: CURRENT_FY });
  });

  it("creates a group without a budget", async () => {
    expect(await createAccountingGroup("New group", "general"))
      .toEqual({ success: true, groupId: GROUP_ID });
    expect(budgetWrites()).toHaveLength(0);
  });

  it("deletes current group/year transactions and budget", async () => {
    expect(await deleteGroupYearData(GROUP_ID, CURRENT_FY)).toEqual({ success: true });
    expect(writesTo(adminDb.calls, "transactions")[0].op).toBe("delete");
    expect(budgetWrites()[0].op).toBe("delete");
  });

  it.each(["create", "delete"] as const)("rejects past-year budget %s before any service write", async (operation) => {
    const result = operation === "create"
      ? await createAccountingGroup("Past group", "general", PAST_FY, 1000)
      : await deleteGroupYearData(GROUP_ID, PAST_FY);
    expect(result).toEqual({ error: "予算の編集権限がありません" });
    expect(adminDb.calls).toHaveLength(0);
  });

  it.each([null, { message: "db down" }])("fails closed for an unknown or unreadable fiscal year (%s)", async (error) => {
    userDb = createSupabaseMock(() => ({ data: null, error }));
    expect(await deleteGroupYearData(GROUP_ID, CURRENT_FY)).toHaveProperty("error");
    expect(await createAccountingGroup("New group", "general", CURRENT_FY, 1000))
      .toHaveProperty("error");
    expect(adminDb.calls).toHaveLength(0);
  });

  it("keeps admin past-year group management", async () => {
    actor = "admin";
    expect(await deleteGroupYearData(GROUP_ID, PAST_FY)).toEqual({ success: true });
  });

  it("creates a fiscal year and its initial budgets as non-admin 会計", async () => {
    userDb = createSupabaseMock((call) => call.table === "fiscal_years"
      ? { data: null } : resolveQuery(call));
    expect(await createFiscalYearBudgets(2027, [{ groupId: GROUP_ID, amount: 1000 }]))
      .toEqual({ success: true });
    expect(writesTo(adminDb.calls, "fiscal_years")[0].payload).toMatchObject({ year: 2027 });
    expect(budgetWrites()[0].payload).toEqual([
      { accounting_group_id: GROUP_ID, amount: 1000, carryover_amount: 0, fiscal_year_id: 2027 },
    ]);
  });

  it("denies group management to a leader", async () => {
    actor = "leader";
    expect(await createAccountingGroup("Forbidden", "general")).toHaveProperty("error");
    expect(await deleteGroupYearData(GROUP_ID, CURRENT_FY)).toHaveProperty("error");
    expect(await toggleAccountingGroupActive(GROUP_ID, false)).toHaveProperty("error");
    expect(adminDb.calls).toHaveLength(0);
  });
});
