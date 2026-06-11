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
