import { describe, expect, it } from "vitest";
import { isDelegableRole } from "@/lib/roles/assignment";
import { buildRoleAccess } from "@/lib/roles/parse";
import * as permissions from "@/lib/roles/permissions";
import {
  canApproveTransaction,
  canCreateFiscalYear,
  canDeleteTransaction,
  canEditBudget,
  canEditTransaction,
  canFileTransactionInGroup,
  canManageGroups,
  canManageSubsidies,
  canSetApprovalFieldsDirectly,
  canViewBudgetPage,
  canViewClubLedger,
  canViewGroup,
  checkTransactionApproval,
  hasAllNonClubGroupAccess,
  type GroupRef,
} from "@/lib/roles/permissions";
import type { RoleAssignment } from "@/lib/roles/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const G1 = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const G2 = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";

const RESTRICTED: GroupRef = { id: G1, type: "leader" };
const UNRELATED: GroupRef = { id: G2, type: "leader" };
const GENERAL: GroupRef = { id: "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3", type: "general" };
const UNTYPED: GroupRef = { id: "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4", type: null };
const CLUB: GroupRef = { id: "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5", type: "club" };

const role = (
  name: string,
  type: string,
  accountingGroupId: string | null = null,
): RoleAssignment => ({ name, type, accountingGroupId });

const ROLES = {
  admin: role("Local Admin", "admin"),
  accounting: role("会計", "accounting"),
  chair: role("部長", "general"),
  viceChair: role("副部長", "general"),
  leaderG1: role("leader", "leader", G1),
  memberG1: role("general", "general", G1),
  provisional: role("仮部員", "general"),
  futureType: role("監査", "auditor"),
} as const;

const access = (...roles: RoleAssignment[]) => buildRoleAccess(roles);

const pendingOf = (createdBy: string) => ({
  created_by: createdBy,
  approval_status: "pending",
});

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

describe("canViewGroup / canFileTransactionInGroup", () => {
  const cases: Array<[string, RoleAssignment[], GroupRef, boolean]> = [
    ["admin, club", [ROLES.admin], CLUB, true],
    ["会計, club", [ROLES.accounting], CLUB, true],
    ["leader of G1, club", [ROLES.leaderG1], CLUB, false],
    ["部長, unrelated restricted group", [ROLES.chair], UNRELATED, true],
    ["会計, unrelated restricted group", [ROLES.accounting], UNRELATED, true],
    ["member of G1, G1", [ROLES.memberG1], RESTRICTED, true],
    ["leader of G1, G1", [ROLES.leaderG1], RESTRICTED, true],
    ["member of G1, G2", [ROLES.memberG1], UNRELATED, false],
    ["no roles, general group", [], GENERAL, true],
    ["no roles, untyped group", [], UNTYPED, true],
    ["no roles, restricted group", [], RESTRICTED, false],
    ["unknown role type, restricted group", [ROLES.futureType], RESTRICTED, false],
  ];

  it.each(cases)("%s → %s", (_label, roles, group, expected) => {
    expect(canViewGroup(access(...roles), group)).toBe(expected);
    expect(canFileTransactionInGroup(access(...roles), group)).toBe(expected);
  });

  it.each([ROLES.chair, ROLES.viceChair])("lets $name view club data without filing rights", (r) => {
    expect(canViewClubLedger(access(r))).toBe(true);
    expect(canViewGroup(access(r), CLUB)).toBe(true);
    expect(canFileTransactionInGroup(access(r), CLUB)).toBe(false);
    expect(permissions.canCreateClubTransaction(access(r))).toBe(false);
    expect(permissions.canManageFinancialAccounts(access(r))).toBe(false);
    for (const owner of [ACTOR_ID, OTHER_ID]) {
      expect(permissions.getTransactionRowPermissions(access(r), {
        ...pendingOf(owner), accounting_group_type: "club",
      }, { actorId: ACTOR_ID, isCurrentFiscalYear: true, isReadOnly: false })).toEqual({
        canEdit: false, canDelete: false, canApprove: false, canChangeApprovalStatus: false,
      });
    }
  });

  it("denies club viewing to general members, even with a club group role", () => {
    const a = access(role("general", "general", CLUB.id));
    expect(canViewClubLedger(a)).toBe(false);
    expect(canViewGroup(a, CLUB)).toBe(false);
  });

  it("denies a missing group even for admins", () => {
    expect(canViewGroup(access(ROLES.admin), null)).toBe(false);
    expect(canFileTransactionInGroup(access(ROLES.admin), undefined)).toBe(false);
  });

  it("gives 部長 / 副部長 / 会計 / admin access to every non-club group", () => {
    for (const r of [ROLES.admin, ROLES.accounting, ROLES.chair, ROLES.viceChair]) {
      expect(hasAllNonClubGroupAccess(access(r))).toBe(true);
    }
    expect(hasAllNonClubGroupAccess(access(ROLES.leaderG1))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

describe("checkTransactionApproval", () => {
  it("lets admin and 会計 decide another member's pending transaction", () => {
    for (const r of [ROLES.admin, ROLES.accounting]) {
      expect(checkTransactionApproval(access(r), pendingOf(OTHER_ID), ACTOR_ID, true))
        .toEqual({ ok: true });
    }
  });

  it("rejects leaders, 部長 and members", () => {
    for (const r of [ROLES.leaderG1, ROLES.chair, ROLES.memberG1]) {
      expect(checkTransactionApproval(access(r), pendingOf(OTHER_ID), ACTOR_ID, true))
        .toEqual({ ok: false, reason: "forbidden" });
    }
  });

  it("rejects self-approval for everyone, admin included", () => {
    for (const r of [ROLES.admin, ROLES.accounting]) {
      expect(checkTransactionApproval(access(r), pendingOf(ACTOR_ID), ACTOR_ID, true))
        .toEqual({ ok: false, reason: "own_transaction" });
    }
  });

  it("rejects a transaction that is no longer pending", () => {
    const tx = { created_by: OTHER_ID, approval_status: "approved" };
    expect(checkTransactionApproval(access(ROLES.admin), tx, ACTOR_ID, true))
      .toEqual({ ok: false, reason: "not_pending" });
  });

  it("limits past fiscal years to admins", () => {
    expect(
      checkTransactionApproval(access(ROLES.accounting), pendingOf(OTHER_ID), ACTOR_ID, false),
    ).toEqual({ ok: false, reason: "past_fiscal_year" });
    expect(
      canApproveTransaction(access(ROLES.admin), pendingOf(OTHER_ID), ACTOR_ID, false),
    ).toBe(true);
  });
});

describe("canEditTransaction", () => {
  it("lets admin and 会計 edit any transaction", () => {
    const tx = { created_by: OTHER_ID, approval_status: "approved" };
    expect(canEditTransaction(access(ROLES.admin), tx, ACTOR_ID)).toBe(true);
    expect(canEditTransaction(access(ROLES.accounting), tx, ACTOR_ID)).toBe(true);
  });

  it("lets the owner edit only while pending", () => {
    const member = access(ROLES.memberG1);
    expect(canEditTransaction(member, pendingOf(ACTOR_ID), ACTOR_ID)).toBe(true);
    expect(
      canEditTransaction(member, { created_by: ACTOR_ID, approval_status: "approved" }, ACTOR_ID),
    ).toBe(false);
  });

  it("does not let a leader edit another member's transaction (D6)", () => {
    expect(canEditTransaction(access(ROLES.leaderG1), pendingOf(OTHER_ID), ACTOR_ID))
      .toBe(false);
  });
});

describe("canSetApprovalFieldsDirectly", () => {
  it("lets admins correct any row, including their own (break-glass)", () => {
    const admin = access(ROLES.admin);
    expect(canSetApprovalFieldsDirectly(admin, { isOwnRow: true, isCurrentFiscalYear: false }))
      .toBe(true);
  });

  it("lets 会計 change other rows in the current fiscal year only", () => {
    const accounting = access(ROLES.accounting);
    expect(canSetApprovalFieldsDirectly(accounting, { isOwnRow: false, isCurrentFiscalYear: true }))
      .toBe(true);
    expect(canSetApprovalFieldsDirectly(accounting, { isOwnRow: true, isCurrentFiscalYear: true }))
      .toBe(false);
    expect(canSetApprovalFieldsDirectly(accounting, { isOwnRow: false, isCurrentFiscalYear: false }))
      .toBe(false);
  });

  it("denies leaders and members", () => {
    for (const r of [ROLES.leaderG1, ROLES.memberG1, ROLES.chair]) {
      expect(
        canSetApprovalFieldsDirectly(access(r), { isOwnRow: false, isCurrentFiscalYear: true }),
      ).toBe(false);
    }
  });
});

describe("canDeleteTransaction", () => {
  it("lets admins delete anything and owners only pending rows", () => {
    const approved = { created_by: ACTOR_ID, approval_status: "approved" };
    expect(canDeleteTransaction(access(ROLES.admin), approved, ACTOR_ID)).toBe(true);
    expect(canDeleteTransaction(access(ROLES.memberG1), approved, ACTOR_ID)).toBe(false);
    expect(canDeleteTransaction(access(ROLES.memberG1), pendingOf(ACTOR_ID), ACTOR_ID)).toBe(true);
    expect(canDeleteTransaction(access(ROLES.accounting), pendingOf(OTHER_ID), ACTOR_ID)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Budgets, subsidies, club ledger
// ---------------------------------------------------------------------------

describe("budget permissions (D4)", () => {
  it("lets admins edit any fiscal year", () => {
    expect(canEditBudget(access(ROLES.admin), { isCurrent: false })).toBe(true);
  });

  it("lets 会計 edit the current fiscal year only", () => {
    expect(canEditBudget(access(ROLES.accounting), { isCurrent: true })).toBe(true);
    expect(canEditBudget(access(ROLES.accounting), { isCurrent: false })).toBe(false);
  });

  it("never lets leaders edit budgets", () => {
    expect(canEditBudget(access(ROLES.leaderG1), { isCurrent: true })).toBe(false);
  });

  it("matches the page gate and fiscal-year creation to admin or 会計", () => {
    for (const [r, expected] of [
      [ROLES.admin, true],
      [ROLES.accounting, true],
      [ROLES.chair, false],
      [ROLES.leaderG1, false],
    ] as const) {
      expect(canViewBudgetPage(access(r))).toBe(expected);
      expect(canCreateFiscalYear(access(r))).toBe(expected);
    }
    expect(canManageGroups(access(ROLES.accounting))).toBe(false);
    expect(canManageGroups(access(ROLES.admin))).toBe(true);
  });
});

describe("subsidy and club ledger permissions", () => {
  it("keeps subsidy management restricted while allowing club viewing", () => {
    expect(canManageSubsidies(access(ROLES.accounting))).toBe(true);
    expect(canManageSubsidies(access(ROLES.chair))).toBe(false);
    expect(canViewClubLedger(access(ROLES.chair))).toBe(true);
    expect(canViewClubLedger(access(ROLES.accounting))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// S1 compatibility: a delegable role must never add a capability
// ---------------------------------------------------------------------------

describe("delegable roles (S1) add no capability", () => {
  const DELEGABLE = [
    role("仮部員", "general"),
    role("OB・OG", "general"),
    role("広報", "general"),
  ];
  const BASES: RoleAssignment[][] = [
    [],
    [ROLES.memberG1],
    [ROLES.leaderG1],
    [ROLES.chair],
    [ROLES.accounting],
  ];
  const GROUPS = [RESTRICTED, UNRELATED, GENERAL, UNTYPED, CLUB];

  // Every exported predicate evaluated over a fixed set of inputs.
  function capabilities(roles: RoleAssignment[]): unknown[] {
    const a = access(...roles);
    return [
      ...GROUPS.map((g) => permissions.canViewGroup(a, g)),
      ...GROUPS.map((g) => permissions.canFileTransactionInGroup(a, g)),
      ...[true, false].map((cur) =>
        permissions.canApproveTransaction(a, pendingOf(OTHER_ID), ACTOR_ID, cur),
      ),
      permissions.canEditTransaction(a, pendingOf(OTHER_ID), ACTOR_ID),
      permissions.canSetApprovalFieldsDirectly(a, { isOwnRow: false, isCurrentFiscalYear: true }),
      permissions.canReassignTransactionPeople(a),
      permissions.canDeleteTransaction(a, pendingOf(OTHER_ID), ACTOR_ID),
      permissions.canViewBudgetPage(a),
      permissions.canEditBudget(a, { isCurrent: true }),
      permissions.canCreateFiscalYear(a),
      permissions.canManageGroups(a),
      permissions.canManageSubsidies(a),
      permissions.canSoftDeleteSubsidyItems(a),
      permissions.canManageMembers(a),
      permissions.canViewClubLedger(a),
      permissions.canCreateClubTransaction(a),
      permissions.canManageFinancialAccounts(a),
      permissions.hasAllNonClubGroupAccess(a),
    ];
  }

  it("uses roles that S1 really treats as delegable", () => {
    for (const r of DELEGABLE) expect(isDelegableRole(r)).toBe(true);
  });

  it.each(BASES.map((b) => [b.map((r) => r.name).join("+") || "(none)", b] as const))(
    "base %s",
    (_label, base) => {
      for (const extra of DELEGABLE) {
        expect(capabilities([...base, extra])).toEqual(capabilities(base));
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Ledger row flags (UI)
// ---------------------------------------------------------------------------

describe("getTransactionRowPermissions", () => {
  const current = { actorId: ACTOR_ID, isCurrentFiscalYear: true, isReadOnly: false };

  it("lets 会計 edit and approve another member's pending row", () => {
    expect(
      permissions.getTransactionRowPermissions(access(ROLES.accounting), pendingOf(OTHER_ID), current),
    ).toEqual({ canEdit: true, canDelete: false, canApprove: true, canChangeApprovalStatus: true });
  });

  it("hides approval controls from 会計 on their own row", () => {
    expect(
      permissions.getTransactionRowPermissions(access(ROLES.accounting), pendingOf(ACTOR_ID), current),
    ).toEqual({ canEdit: true, canDelete: false, canApprove: false, canChangeApprovalStatus: false });
  });

  it("shows leaders no approval or edit controls on other rows", () => {
    expect(
      permissions.getTransactionRowPermissions(access(ROLES.leaderG1), pendingOf(OTHER_ID), current),
    ).toEqual({ canEdit: false, canDelete: false, canApprove: false, canChangeApprovalStatus: false });
  });

  it("keeps past fiscal years approvable by admins only (D7)", () => {
    const past = { ...current, isCurrentFiscalYear: false };
    expect(
      permissions.getTransactionRowPermissions(access(ROLES.admin), pendingOf(OTHER_ID), past)
        .canApprove,
    ).toBe(true);
    expect(
      permissions.getTransactionRowPermissions(access(ROLES.accounting), pendingOf(OTHER_ID), past)
        .canApprove,
    ).toBe(false);
  });

  it("allows nothing in a read-only view or without a signed-in actor", () => {
    const none = { canEdit: false, canDelete: false, canApprove: false, canChangeApprovalStatus: false };
    expect(
      permissions.getTransactionRowPermissions(access(ROLES.admin), pendingOf(OTHER_ID), {
        ...current,
        isReadOnly: true,
      }),
    ).toEqual(none);
    expect(
      permissions.getTransactionRowPermissions(access(ROLES.admin), pendingOf(OTHER_ID), {
        ...current,
        actorId: undefined,
      }),
    ).toEqual(none);
  });
});
