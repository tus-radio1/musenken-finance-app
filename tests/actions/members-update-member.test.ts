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
const TARGET_ID = "22222222-2222-4222-8222-222222222222";

const ADMIN_ROLE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VICE_CHAIR_ROLE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROVISIONAL_ROLE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ALUMNI_ROLE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const UNKNOWN_ROLE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ACCOUNTING_ROLE_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const CHAIR_ROLE_ID = "12121212-1212-4121-8121-121212121212";
const GROUP_LEADER_ROLE_ID = "34343434-3434-4343-8343-343434343434";
const GROUP_GENERAL_ROLE_ID = "56565656-5656-4565-8565-565656565656";
const FUTURE_TYPE_ROLE_ID = "78787878-7878-4787-8787-787878787878";
const GROUP_ID = "90909090-9090-4909-8909-909090909090";

const ROLES = [
  { id: ADMIN_ROLE_ID, name: "Local Admin", type: "admin", accounting_group_id: null },
  { id: VICE_CHAIR_ROLE_ID, name: "副部長", type: "general", accounting_group_id: null },
  { id: CHAIR_ROLE_ID, name: "部長", type: "general", accounting_group_id: null },
  { id: ACCOUNTING_ROLE_ID, name: "会計", type: "accounting", accounting_group_id: null },
  { id: PROVISIONAL_ROLE_ID, name: "仮部員", type: "general", accounting_group_id: null },
  { id: ALUMNI_ROLE_ID, name: "OB・OG", type: "general", accounting_group_id: null },
  { id: GROUP_LEADER_ROLE_ID, name: "leader", type: "leader", accounting_group_id: GROUP_ID },
  { id: GROUP_GENERAL_ROLE_ID, name: "general", type: "general", accounting_group_id: GROUP_ID },
  { id: FUTURE_TYPE_ROLE_ID, name: "監査", type: "auditor", accounting_group_id: null },
];

const PROTECTED_ROLE_ERROR = "このロールの変更には管理者権限が必要です";
const PROTECTED_TARGET_ERROR = "この部員の操作には管理者権限が必要です";

type Actor = "manager" | "admin" | "member";

const ACTOR_ROLE_IDS: Record<Actor, string[]> = {
  manager: [VICE_CHAIR_ROLE_ID],
  admin: [ADMIN_ROLE_ID],
  member: [PROVISIONAL_ROLE_ID],
};

function roleById(id: string) {
  return ROLES.find((r) => r.id === id);
}

function roleRowsFor(roleIds: string[]) {
  return roleIds.map((id) => {
    const role = roleById(id)!;
    return {
      role_id: id,
      roles: {
        name: role.name,
        type: role.type,
        accounting_group_id: role.accounting_group_id,
      },
    };
  });
}

function accessFor(actor: Actor) {
  const roles = ACTOR_ROLE_IDS[actor].map((id) => {
    const role = roleById(id)!;
    return {
      name: role.name,
      type: role.type,
      accountingGroupId: role.accounting_group_id,
    };
  });
  const isAdmin = actor === "admin";
  return {
    roles,
    isAdmin,
    hasAccountingRole: false,
    canManageMembers: actor !== "member",
    groupRoleTypes: {},
  };
}

// Simulated DB state: role assignments per user.
let assignments: Record<string, string[]>;
let actor: Actor;
// Rows a profiles UPDATE reports back (RLS can filter to []).
let profileUpdateRows: Array<{ id: string }>;

function resolveQuery(call: QueryCall): QueryResult {
  if (call.op === "rpc" && call.table === "soft_delete_member") return { data: TARGET_ID };
  if (call.table === "user_roles" && call.op === "select") {
    const userId = eqValue(call, "user_id") as string;
    return { data: roleRowsFor(assignments[userId] ?? []) };
  }
  if (call.table === "roles" && call.op === "select") {
    const name = eqValue(call, "name");
    if (typeof name === "string") {
      return { data: ROLES.find((r) => r.name === name) ?? null };
    }
    return { data: ROLES };
  }
  if (call.table === "profiles" && call.op === "update") {
    return { data: profileUpdateRows };
  }
  if (call.table === "profiles" && call.op === "select") {
    return { data: { id: TARGET_ID, name: "Target" } };
  }
  return { error: null };
}

let userDb: ReturnType<typeof createSupabaseMock>;
let adminDb: ReturnType<typeof createSupabaseMock>;

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
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

const { updateMember, deleteMember, retireMember } = await import(
  "@/app/(authenticated)/members/manage/actions"
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_DATA = { name: "Target", student_number: "4623045", grade: 2 };

function insertedRoleIds(): string[] {
  return writesTo(adminDb.calls, "user_roles")
    .filter((c) => c.op === "insert")
    .flatMap((c) =>
      [c.payload as { role_id: string } | Array<{ role_id: string }>]
        .flat()
        .map((r) => r.role_id),
    );
}

function deleteCalls(): QueryCall[] {
  return [...adminDb.calls, ...userDb.calls].filter(
    (c) => c.table === "user_roles" && c.op === "delete",
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  actor = "manager";
  assignments = {
    [ACTOR_ID]: [...ACTOR_ROLE_IDS.manager],
    [TARGET_ID]: [PROVISIONAL_ROLE_ID],
  };
  profileUpdateRows = [{ id: TARGET_ID }];
  userDb = createSupabaseMock(resolveQuery);
  adminDb = createSupabaseMock(resolveQuery);
});

// ---------------------------------------------------------------------------
// updateMember
// ---------------------------------------------------------------------------

describe("updateMember role assignment", () => {
  it("rejects a non-admin manager granting the admin role to themselves", async () => {
    const result = await updateMember(ACTOR_ID, {
      ...BASE_DATA,
      role_ids: [VICE_CHAIR_ROLE_ID, ADMIN_ROLE_ID],
    });

    expect(result).toEqual({ error: PROTECTED_ROLE_ERROR });
    expect(insertedRoleIds()).not.toContain(ADMIN_ROLE_ID);
    expect(writesTo(adminDb.calls, "user_roles")).toHaveLength(0);
    expect(writesTo(userDb.calls, "profiles")).toHaveLength(0);
    expect(adminDb.authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it("rejects a non-admin manager granting the admin role to another member", async () => {
    const result = await updateMember(TARGET_ID, {
      ...BASE_DATA,
      role_ids: [PROVISIONAL_ROLE_ID, ADMIN_ROLE_ID],
    });

    expect(result).toEqual({ error: PROTECTED_ROLE_ERROR });
    expect(writesTo(adminDb.calls, "user_roles")).toHaveLength(0);
  });

  it("rejects a non-admin manager removing the admin role from an admin", async () => {
    assignments[TARGET_ID] = [ADMIN_ROLE_ID, PROVISIONAL_ROLE_ID];

    const result = await updateMember(TARGET_ID, {
      ...BASE_DATA,
      role_ids: [PROVISIONAL_ROLE_ID],
    });

    expect(result).toEqual({ error: PROTECTED_ROLE_ERROR });
    expect(deleteCalls()).toHaveLength(0);
  });

  it("lets a non-admin manager edit an admin's other roles without touching the admin role", async () => {
    assignments[TARGET_ID] = [ADMIN_ROLE_ID, PROVISIONAL_ROLE_ID];

    const result = await updateMember(TARGET_ID, {
      ...BASE_DATA,
      role_ids: [ADMIN_ROLE_ID, ALUMNI_ROLE_ID],
    });

    expect(result).toEqual({ success: true });
    const deletes = deleteCalls();
    expect(deletes).toHaveLength(1);
    expect(deletes[0].filters).toContainEqual({
      method: "in",
      args: ["role_id", [PROVISIONAL_ROLE_ID]],
    });
    expect(insertedRoleIds()).toEqual([ALUMNI_ROLE_ID]);
  });

  it("lets a non-admin manager swap non-admin roles with a diff-based sync", async () => {
    const result = await updateMember(TARGET_ID, {
      ...BASE_DATA,
      role_ids: [ALUMNI_ROLE_ID],
    });

    expect(result).toEqual({ success: true });
    const deletes = deleteCalls();
    expect(deletes).toHaveLength(1);
    expect(eqValue(deletes[0], "user_id")).toBe(TARGET_ID);
    expect(deletes[0].filters).toContainEqual({
      method: "in",
      args: ["role_id", [PROVISIONAL_ROLE_ID]],
    });
    expect(insertedRoleIds()).toEqual([ALUMNI_ROLE_ID]);
  });

  it("lets a global admin grant the admin role", async () => {
    actor = "admin";
    assignments[ACTOR_ID] = [...ACTOR_ROLE_IDS.admin];

    const result = await updateMember(TARGET_ID, {
      ...BASE_DATA,
      role_ids: [PROVISIONAL_ROLE_ID, ADMIN_ROLE_ID],
    });

    expect(result).toEqual({ success: true });
    expect(insertedRoleIds()).toEqual([ADMIN_ROLE_ID]);
  });

  it("lets a global admin revoke the admin role", async () => {
    actor = "admin";
    assignments[ACTOR_ID] = [...ACTOR_ROLE_IDS.admin];
    assignments[TARGET_ID] = [ADMIN_ROLE_ID, PROVISIONAL_ROLE_ID];

    const result = await updateMember(TARGET_ID, {
      ...BASE_DATA,
      role_ids: [PROVISIONAL_ROLE_ID],
    });

    expect(result).toEqual({ success: true });
    expect(deleteCalls()[0].filters).toContainEqual({
      method: "in",
      args: ["role_id", [ADMIN_ROLE_ID]],
    });
  });

  it.each([
    ["会計 (accounting)", ACCOUNTING_ROLE_ID],
    ["部長 (member-management name)", CHAIR_ROLE_ID],
    ["a group leader role", GROUP_LEADER_ROLE_ID],
    ["a group member role", GROUP_GENERAL_ROLE_ID],
    ["a role with an unrecognised type", FUTURE_TYPE_ROLE_ID],
  ])("rejects a non-admin manager granting themselves %s", async (_label, roleId) => {
    const result = await updateMember(ACTOR_ID, {
      ...BASE_DATA,
      role_ids: [VICE_CHAIR_ROLE_ID, roleId],
    });

    expect(result).toEqual({ error: PROTECTED_ROLE_ERROR });
    expect(writesTo(adminDb.calls, "user_roles")).toHaveLength(0);
  });

  it("rejects a non-admin manager stripping 会計 from another member", async () => {
    assignments[TARGET_ID] = [ACCOUNTING_ROLE_ID, PROVISIONAL_ROLE_ID];

    const result = await updateMember(TARGET_ID, {
      ...BASE_DATA,
      role_ids: [PROVISIONAL_ROLE_ID],
    });

    expect(result).toEqual({ error: PROTECTED_ROLE_ERROR });
    expect(deleteCalls()).toHaveLength(0);
  });

  it("lets a global admin assign 会計 and group roles", async () => {
    actor = "admin";
    assignments[ACTOR_ID] = [...ACTOR_ROLE_IDS.admin];

    const result = await updateMember(TARGET_ID, {
      ...BASE_DATA,
      role_ids: [PROVISIONAL_ROLE_ID, ACCOUNTING_ROLE_ID, GROUP_LEADER_ROLE_ID],
    });

    expect(result).toEqual({ success: true });
    expect(insertedRoleIds()).toEqual([ACCOUNTING_ROLE_ID, GROUP_LEADER_ROLE_ID]);
  });

  it("rejects unknown role ids before writing anything", async () => {
    const result = await updateMember(TARGET_ID, {
      ...BASE_DATA,
      role_ids: [UNKNOWN_ROLE_ID],
    });

    expect(result).toEqual({ error: "入力データが不正です" });
    expect(writesTo(adminDb.calls, "user_roles")).toHaveLength(0);
    expect(writesTo(userDb.calls, "profiles")).toHaveLength(0);
  });

  it("rejects callers without member-management permission", async () => {
    actor = "member";
    assignments[ACTOR_ID] = [...ACTOR_ROLE_IDS.member];

    const result = await updateMember(TARGET_ID, {
      ...BASE_DATA,
      role_ids: [PROVISIONAL_ROLE_ID],
    });

    expect(result).toEqual({ error: "権限がありません" });
    expect(adminDb.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// deleteMember / retireMember
// ---------------------------------------------------------------------------

describe("deleteMember / retireMember on admin targets", () => {
  it("blocks a non-admin manager from deleting an admin's account", async () => {
    assignments[TARGET_ID] = [ADMIN_ROLE_ID];

    const result = await deleteMember(TARGET_ID);

    expect(result).toEqual({ error: PROTECTED_TARGET_ERROR });
    expect(adminDb.authAdmin.deleteUser).not.toHaveBeenCalled();
    expect(deleteCalls()).toHaveLength(0);
  });

  it("blocks a non-admin manager from retiring an admin", async () => {
    assignments[TARGET_ID] = [ADMIN_ROLE_ID];

    const result = await retireMember(TARGET_ID);

    expect(result).toEqual({ error: PROTECTED_TARGET_ERROR });
    expect(deleteCalls()).toHaveLength(0);
    expect(adminDb.authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it("blocks a non-admin manager from deleting the 会計 holder", async () => {
    assignments[TARGET_ID] = [ACCOUNTING_ROLE_ID];

    const result = await deleteMember(TARGET_ID);

    expect(result).toEqual({ error: PROTECTED_TARGET_ERROR });
    expect(adminDb.authAdmin.deleteUser).not.toHaveBeenCalled();
  });

  it("still lets a non-admin manager delete a regular member", async () => {
    const result = await deleteMember(TARGET_ID);

    expect(result).toEqual({ success: true });
    expect(adminDb.authAdmin.updateUserById).toHaveBeenCalledWith(TARGET_ID, { ban_duration: "876000h" });
    expect(adminDb.authAdmin.deleteUser).not.toHaveBeenCalled();
  });

  it("lets a global admin delete another admin", async () => {
    actor = "admin";
    assignments[ACTOR_ID] = [...ACTOR_ROLE_IDS.admin];
    assignments[TARGET_ID] = [ADMIN_ROLE_ID];

    const result = await deleteMember(TARGET_ID);

    expect(result).toEqual({ success: true });
    expect(adminDb.authAdmin.updateUserById).toHaveBeenCalledWith(TARGET_ID, { ban_duration: "876000h" });
    expect(adminDb.authAdmin.deleteUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Profile / role writes by non-admin managers (step 13)
// ---------------------------------------------------------------------------

describe("member writes by a non-admin manager", () => {
  // Bug (item 6): profiles RLS only allows own row or admin, so the profile
  // update by 部長/副部長/会計 touched 0 rows while Auth and roles changed.
  it("updateMember writes the profile with the service-role client", async () => {
    const result = await updateMember(TARGET_ID, {
      ...BASE_DATA,
      role_ids: [PROVISIONAL_ROLE_ID],
    });

    expect(result).toEqual({ success: true });
    expect(writesTo(userDb.calls, "profiles")).toHaveLength(0);
    expect(writesTo(adminDb.calls, "profiles")).toHaveLength(1);
  });

  it("updateMember stops before Auth and roles when no profile row was updated", async () => {
    profileUpdateRows = [];

    const result = await updateMember(TARGET_ID, {
      ...BASE_DATA,
      role_ids: [ALUMNI_ROLE_ID],
    });

    expect(result).toHaveProperty("error");
    expect(adminDb.authAdmin.updateUserById).not.toHaveBeenCalled();
    expect(writesTo(adminDb.calls, "user_roles")).toHaveLength(0);
  });

  // Bug (item 6): user_roles RLS is admin-only, so the role delete touched 0 rows.
  it("retireMember replaces roles with the service-role client", async () => {
    const result = await retireMember(TARGET_ID);

    expect(result).toEqual({ success: true });
    expect(writesTo(userDb.calls, "user_roles")).toHaveLength(0);
    expect(writesTo(userDb.calls, "profiles")).toHaveLength(0);
    expect(insertedRoleIds()).toEqual([ALUMNI_ROLE_ID]);
  });

  it("retireMember does not re-grant OB・OG and removes only the other roles", async () => {
    assignments[TARGET_ID] = [PROVISIONAL_ROLE_ID, ALUMNI_ROLE_ID];

    const result = await retireMember(TARGET_ID);

    expect(result).toEqual({ success: true });
    expect(insertedRoleIds()).toEqual([]);
    const [del] = deleteCalls();
    expect(del.filters).toContainEqual({ method: "in", args: ["role_id", [PROVISIONAL_ROLE_ID]] });
  });

  // Review finding: roles were re-read after the S1 check, so a protected role
  // granted in between was deleted with the service-role client.
  it("retireMember never removes a role granted after the permission check", async () => {
    let targetRoleReads = 0;
    const grantAdminAfterFirstRead = (call: QueryCall): QueryResult => {
      const result = resolveQuery(call);
      const isTargetRoleRead =
        call.table === "user_roles" &&
        call.op === "select" &&
        eqValue(call, "user_id") === TARGET_ID;
      if (isTargetRoleRead && ++targetRoleReads === 1) {
        assignments[TARGET_ID] = [...assignments[TARGET_ID], ADMIN_ROLE_ID];
      }
      return result;
    };
    userDb = createSupabaseMock(grantAdminAfterFirstRead);
    adminDb = createSupabaseMock(grantAdminAfterFirstRead);

    const result = await retireMember(TARGET_ID);

    expect(result).toEqual({ success: true });
    const removed = deleteCalls().flatMap(
      (c) => c.filters.find((f) => f.method === "in")?.args[1] as string[],
    );
    expect(removed).toEqual([PROVISIONAL_ROLE_ID]);
    expect(removed).not.toContain(ADMIN_ROLE_ID);
  });

  it("retireMember stops before any write when no profile row was updated", async () => {
    profileUpdateRows = [];

    const result = await retireMember(TARGET_ID);

    expect(result).toHaveProperty("error");
    expect(writesTo(adminDb.calls, "user_roles")).toHaveLength(0);
    expect(adminDb.authAdmin.updateUserById).not.toHaveBeenCalled();
  });
});


describe("deleteMember atomic soft delete and Auth ban", () => {
  it("bans only after a successful RPC", async () => {
    const events: string[] = [];
    userDb.client.rpc.mockImplementation(async () => {
      events.push("rpc");
      return { data: TARGET_ID, error: null };
    });
    adminDb.authAdmin.updateUserById.mockImplementation(async () => {
      events.push("ban");
      return { data: {}, error: null };
    });
    expect(await deleteMember(TARGET_ID)).toEqual({ success: true });
    expect(events).toEqual(["rpc", "ban"]);
    expect(writesTo(adminDb.calls, "profiles")).toHaveLength(0);
    expect(adminDb.authAdmin.deleteUser).not.toHaveBeenCalled();
  });

  it("does not ban when the RPC fails or reports no row", async () => {
    userDb.client.rpc.mockResolvedValueOnce({ data: null, error: { message: "forbidden" } });
    expect(await deleteMember(TARGET_ID)).toHaveProperty("error");
    userDb.client.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await deleteMember(TARGET_ID)).toHaveProperty("error");
    expect(adminDb.authAdmin.updateUserById).not.toHaveBeenCalled();
    expect(adminDb.authAdmin.deleteUser).not.toHaveBeenCalled();
  });

  it("rejects self-delete before RPC or Auth calls", async () => {
    actor = "admin";
    expect(await deleteMember(ACTOR_ID)).toEqual({ error: "自分自身は削除できません" });
    expect(userDb.client.rpc).not.toHaveBeenCalled();
    expect(adminDb.authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it("rejects callers without member management permission", async () => {
    actor = "member";
    expect(await deleteMember(TARGET_ID)).toEqual({ error: "権限がありません" });
    expect(userDb.client.rpc).not.toHaveBeenCalled();
  });

  it("reports a ban failure and permits retry of the already-deleted member", async () => {
    adminDb.authAdmin.updateUserById.mockResolvedValueOnce({ data: {}, error: { message: "Auth unavailable" } } as never);
    expect(await deleteMember(TARGET_ID)).toMatchObject({ error: expect.stringContaining("論理削除済み") });
    expect(console.error).toHaveBeenCalled();
    assignments[TARGET_ID] = [];
    expect(await deleteMember(TARGET_ID)).toEqual({ success: true });
    expect(userDb.client.rpc).toHaveBeenCalledTimes(2);
    expect(adminDb.authAdmin.updateUserById).toHaveBeenCalledTimes(2);
    expect(adminDb.authAdmin.deleteUser).not.toHaveBeenCalled();
  });
});


it("reports unexpected Auth ban exceptions after the RPC succeeds", async () => {
  adminDb.authAdmin.updateUserById.mockRejectedValueOnce(new Error("connection lost"));
  expect(await deleteMember(TARGET_ID)).toMatchObject({ error: expect.stringContaining("論理削除済み") });
  expect(userDb.client.rpc).toHaveBeenCalledWith("soft_delete_member", { p_user_id: TARGET_ID });
  expect(console.error).toHaveBeenCalled();
  expect(adminDb.authAdmin.deleteUser).not.toHaveBeenCalled();
});
