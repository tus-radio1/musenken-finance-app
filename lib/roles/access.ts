/**
 * ログインユーザーのロール取得（サーバー専用）。
 *
 * user_roles → roles を JOIN して取得し、解釈は lib/roles/parse.ts、
 * 操作ごとの判定は lib/roles/permissions.ts に任せる。
 * Server Action の認可プリアンブルで resolveAuthWithRoles() 経由で呼ばれる。
 */

import "server-only";

import type { AuthContext } from "@/lib/auth/types";
import { buildRoleAccess, parseRoleAssignments } from "./parse";
import type { RoleAccessContext } from "./types";

export type RoleAccessResult =
  | { ok: true; access: RoleAccessContext }
  | { ok: false };

/**
 * ロールの取得に失敗した場合は空のロールで続行せず ok: false を返す
 * （権限がないのか取得できなかったのかを区別するため）。
 */
export async function getUserRoleAccess(
  auth: AuthContext,
): Promise<RoleAccessResult> {
  const { data, error } = await auth.supabase
    .from("user_roles")
    .select("roles(name, type, accounting_group_id)")
    .eq("user_id", auth.profileId);

  if (error) {
    console.error("[getUserRoleAccess] Role lookup error:", error);
    return { ok: false };
  }

  return { ok: true, access: buildRoleAccess(parseRoleAssignments(data)) };
}

// ---------------------------------------------------------------------------
// Legacy budget rule, kept unchanged until R5 replaces it with canEditBudget.
// ---------------------------------------------------------------------------

/** @deprecated R5 replaces this with canEditBudget (lib/roles/permissions.ts). */
export function canManageBudget(
  access: RoleAccessContext,
  accountingGroupId: string,
): boolean {
  const types = access.groupRoleTypes[accountingGroupId];
  return access.isAdmin || (types?.includes("leader") ?? false);
}
