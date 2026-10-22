/**
 * ロール行の解釈（純粋関数）。
 *
 * user_roles → roles を JOIN した PostgREST の結果を RoleAssignment に変換し、
 * そこから RoleAccessContext を組み立てる。サーバー（lib/roles/access.ts）と
 * ブラウザ（lib/use-sidebar-data.ts）の両方から使うため server-only にしない。
 */

import { MANAGE_MEMBER_ROLE_NAMES, ROLE_NAMES_JA, ROLE_TYPES } from "./constants";
import type { RoleAccessContext, RoleAssignment } from "./types";

/** Columns of `roles` as selected through `user_roles`. All optional on purpose. */
export type RawRoleRow = {
  name?: string | null;
  type?: string | null;
  accounting_group_id?: string | null;
};

export type RawUserRoleRow = {
  roles?: RawRoleRow | readonly RawRoleRow[] | null;
};

/**
 * PostgREST embeds a to-one relation as an object, but a to-many relation (or an
 * ambiguous one) as an array. Normalize both, and null, to an array.
 */
export function normalizeJoined<T>(rel: T | readonly T[] | null | undefined): T[] {
  if (rel === null || rel === undefined) return [];
  if (Array.isArray(rel)) return [...(rel as readonly T[])];
  return [rel as T];
}

/** Missing name/type become "" so they never match a known role (fail closed). */
export function toRoleAssignment(raw: RawRoleRow): RoleAssignment {
  return {
    name: raw.name ?? "",
    type: raw.type ?? "",
    accountingGroupId: raw.accounting_group_id ?? null,
  };
}

export function parseRoleAssignments(
  rows: readonly RawUserRoleRow[] | null | undefined,
): RoleAssignment[] {
  return (rows ?? []).flatMap((row) =>
    normalizeJoined(row?.roles).map(toRoleAssignment),
  );
}

export function buildRoleAccess(
  roles: readonly RoleAssignment[],
): RoleAccessContext {
  const isAdmin = roles.some((r) => r.type === ROLE_TYPES.ADMIN);
  const hasAccountingRole = roles.some(
    (r) => r.name === ROLE_NAMES_JA.ACCOUNTING,
  );
  const canManageMembers =
    isAdmin ||
    roles.some((r) =>
      (MANAGE_MEMBER_ROLE_NAMES as readonly string[]).includes(r.name),
    );

  const groupRoleTypes: Record<string, RoleAssignment["type"][]> = {};
  for (const r of roles) {
    if (!r.accountingGroupId) continue;
    groupRoleTypes[r.accountingGroupId] = [
      ...(groupRoleTypes[r.accountingGroupId] ?? []),
      r.type,
    ];
  }

  return {
    roles: [...roles],
    isAdmin,
    hasAccountingRole,
    canManageMembers,
    groupRoleTypes,
  };
}
