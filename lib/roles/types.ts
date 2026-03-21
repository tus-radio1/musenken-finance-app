import type { RoleNameJa, RoleType } from "./constants";

export type RoleAssignment = {
  name: RoleNameJa;
  type: RoleType;
  accountingGroupId: string | null;
};

export type RoleAccessContext = {
  roles: readonly RoleAssignment[];
  isAdmin: boolean;
  hasAccountingRole: boolean;
  canManageMembers: boolean;
  groupRoleTypes: Readonly<Record<string, readonly RoleType[]>>;
};
