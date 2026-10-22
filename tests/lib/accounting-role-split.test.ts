import { describe, expect, it } from "vitest";
import { isDelegableRole, planRoleSync } from "@/lib/roles/assignment";
import { buildRoleAccess } from "@/lib/roles/parse";
import * as p from "@/lib/roles/permissions";
import type { RoleAssignment } from "@/lib/roles/types";

const accountant: RoleAssignment = { name: "会計", type: "accounting", accountingGroupId: null };
const admin: RoleAssignment = { name: "Admin", type: "admin", accountingGroupId: null };
const actorId = "accountant";
const other = { created_by: "member", approval_status: "approved" };
const pending = { ...other, approval_status: "pending" };
const current = { actorId, isCurrentFiscalYear: true, isReadOnly: false };

describe("accounting separated from admin", () => {
  it.each([[accountant], [admin, accountant]])("grants the agreed accounting rights (%j)", (...roles) => {
    const access = buildRoleAccess(roles);
    expect(p.canDeleteTransaction(access, other, actorId)).toBe(true);
    expect(p.getTransactionRowPermissions(access, other, current).canDelete).toBe(true);
    expect(p.canSoftDeleteSubsidyItems(access)).toBe(true);
    expect(p.canManageGroups(access)).toBe(true);
    expect(p.canCreateFiscalYear(access)).toBe(true);
    expect(p.canViewBudgetPage(access)).toBe(true);
  });

  it.each([false, true])("preserves the admin-only boundaries (also Admin: %s)", (alsoAdmin) => {
    const access = buildRoleAccess(alsoAdmin ? [accountant, admin] : [accountant]);
    expect(access.isAdmin).toBe(alsoAdmin);
    expect(access.hasAccountingRole).toBe(true);
    expect(p.canManageFinancialAccounts(access)).toBe(alsoAdmin);
    expect(p.canEditBudget(access, { isCurrent: false })).toBe(alsoAdmin);
    expect(p.canApproveTransaction(access, pending, actorId, false)).toBe(alsoAdmin);
    expect(p.canSetApprovalFieldsDirectly(access, { isOwnRow: true, isCurrentFiscalYear: true }))
      .toBe(alsoAdmin);
    expect(p.canReassignTransactionPeople(access)).toBe(alsoAdmin);
    expect(p.canApproveTransaction(access, { ...pending, created_by: actorId }, actorId, true))
      .toBe(false);
    for (const officer of [admin, accountant,
      { name: "部長", type: "leader", accountingGroupId: null },
      { name: "副部長", type: "leader", accountingGroupId: null }]) {
      expect(isDelegableRole(officer)).toBe(false);
      expect(planRoleSync({
        actorIsAdmin: access.isAdmin, currentRoleIds: [], requestedRoleIds: ["officer"],
        roleById: { officer },
      })).toEqual(alsoAdmin
        ? { ok: true, toAdd: ["officer"], toRemove: [] }
        : { ok: false, reason: "protected_role" });
    }
  });

  it("fixes the role data without changing the meaning of admin detection", () => {
    expect(buildRoleAccess([{ ...accountant, type: "admin" }]).isAdmin).toBe(true);
    expect(buildRoleAccess([accountant]).isAdmin).toBe(false);
    expect(buildRoleAccess([accountant, admin]).isAdmin).toBe(true);
  });

  it("grants accounting by name, never by type alone", () => {
    const access = buildRoleAccess([{ ...accountant, name: "Unrelated" }]);
    expect(p.canManageGroups(access)).toBe(false);
    expect(p.canSoftDeleteSubsidyItems(access)).toBe(false);
    expect(p.canDeleteTransaction(access, other, actorId)).toBe(false);
  });
});
