import type { AuthContext } from "@/lib/auth/types";
import type { RoleAssignment, RoleAccessContext } from "./types";
import {
  ROLE_TYPES,
  ROLE_NAMES_JA,
  MANAGE_MEMBER_ROLE_NAMES,
  type RoleNameJa,
  type RoleType,
} from "./constants";

type RawRoleRow = {
  name: string | null;
  type: string | null;
  accounting_group_id: string | null;
};

export async function getUserRoleAccess(
  auth: AuthContext,
): Promise<RoleAccessContext> {
  const { data: userRoles } = await auth.supabase
    .from("user_roles")
    .select("roles(name, type, accounting_group_id)")
    .eq("user_id", auth.profileId);

  const roles: RoleAssignment[] = (userRoles || []).flatMap((ur) => {
    const rr = (ur as unknown as { roles?: RawRoleRow | RawRoleRow[] | null })
      .roles;
    if (Array.isArray(rr)) return rr.map(normalize);
    return rr ? [normalize(rr)] : [];
  });

  const isAdmin = roles.some((r) => r.type === ROLE_TYPES.ADMIN);
  const hasAccountingRole = roles.some(
    (r) => r.name === ROLE_NAMES_JA.ACCOUNTING,
  );
  const canManageMembers =
    isAdmin ||
    roles.some(
      (r) =>
        r.name !== null &&
        (MANAGE_MEMBER_ROLE_NAMES as readonly string[]).includes(r.name),
    );

  const groupRoleTypes: Record<string, RoleType[]> = {};
  for (const r of roles) {
    if (r.accountingGroupId) {
      const existing = groupRoleTypes[r.accountingGroupId] ?? [];
      existing.push(r.type);
      groupRoleTypes[r.accountingGroupId] = existing;
    }
  }

  return {
    roles,
    isAdmin,
    hasAccountingRole,
    canManageMembers,
    groupRoleTypes,
  };
}

function normalize(raw: RawRoleRow): RoleAssignment {
  return {
    name: (raw.name ?? "") as RoleNameJa,
    type: (raw.type ?? "") as RoleType,
    accountingGroupId: raw.accounting_group_id,
  };
}

export function isGroupLeader(
  access: RoleAccessContext,
  accountingGroupId: string,
): boolean {
  const types = access.groupRoleTypes[accountingGroupId];
  return types?.includes(ROLE_TYPES.LEADER) ?? false;
}

export function canManageBudget(
  access: RoleAccessContext,
  accountingGroupId: string,
): boolean {
  return access.isAdmin || isGroupLeader(access, accountingGroupId);
}
