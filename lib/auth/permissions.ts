/**
 * 権限チェックヘルパー。
 *
 * Server Action の認可プリアンブルで使用する。
 * access を事前取得済みなら渡すことで DB 再問い合わせを避けられる。
 */

import type { AuthContext } from "./types";
import type { RoleAccessContext } from "@/lib/roles/types";
import { getUserRoleAccess } from "@/lib/roles/access";

export type PermissionCheckResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * グローバル管理者のみ許可。
 * システム設定変更・ユーザー作成など、影響範囲の広い操作に使用する。
 */
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

/**
 * 部員管理権限（会計・部長・副部長・管理者）を要求する。
 * MANAGE_MEMBER_ROLE_NAMES で定義されたロール名に基づいて判定する。
 */
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

// ---------------------------------------------------------------------------
// Club-wide ledger permissions (部全体会計)
// ---------------------------------------------------------------------------

/**
 * Check if user can view the club-wide ledger (部全体会計).
 * Only accounting staff and admins per the spec decision.
 */
export function canViewClubLedger(access: RoleAccessContext): boolean {
  return access.isAdmin || access.hasAccountingRole;
}

/**
 * Check if user can create/edit club-wide transactions.
 * Only accounting staff and admins.
 */
export function canCreateClubTransaction(access: RoleAccessContext): boolean {
  return access.isAdmin || access.hasAccountingRole;
}

/**
 * Check if user can manage financial account master data.
 * Only admins.
 */
export function canManageFinancialAccounts(
  access: RoleAccessContext,
): boolean {
  return access.isAdmin;
}

/**
 * Verify that the user has permission to write club-wide transactions.
 * Returns PermissionCheckResult for use in server actions.
 */
export async function verifyClubTransactionPermission(
  auth: AuthContext,
  access?: RoleAccessContext,
): Promise<PermissionCheckResult> {
  const roleAccess = access ?? (await getUserRoleAccess(auth));
  if (!canCreateClubTransaction(roleAccess)) {
    return {
      ok: false,
      error: "部全体取引の作成には会計担当または管理者権限が必要です",
    };
  }
  return { ok: true };
}
