import type { AuthContext } from "./types";
import type { RoleAccessContext } from "@/lib/roles/types";
import { getUserRoleAccess } from "@/lib/roles/access";

export type PermissionCheckResult =
  | { ok: true }
  | { ok: false; error: string };

export async function verifyAdmin(
  auth: AuthContext,
  access?: RoleAccessContext,
): Promise<PermissionCheckResult> {
  const roleAccess = access ?? (await getUserRoleAccess(auth));
  if (!roleAccess.isAdmin) {
    return { ok: false, error: "管理者権限が必要です" };
  }
  return { ok: true };
}

export async function verifyManageMembersPermission(
  auth: AuthContext,
  access?: RoleAccessContext,
): Promise<PermissionCheckResult> {
  const roleAccess = access ?? (await getUserRoleAccess(auth));
  if (!roleAccess.canManageMembers) {
    return { ok: false, error: "権限がありません" };
  }
  return { ok: true };
}
