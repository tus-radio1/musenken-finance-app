/**
 * 権限チェックヘルパー（Server Action 用の非同期ラッパー）。
 *
 * 判定そのものは lib/roles/permissions.ts の純粋関数に集約している。
 * access を事前取得済みなら渡すことで DB 再問い合わせを避けられる。
 */

import type { AuthContext } from "./types";
import type { RoleAccessContext } from "@/lib/roles/types";
import { getUserRoleAccess } from "@/lib/roles/access";
import {
  canCreateClubTransaction,
  canManageMembers,
  isAdmin,
} from "@/lib/roles/permissions";
import { ROLE_LOOKUP_ERROR } from "./context";

export type PermissionCheckResult =
  | { ok: true }
  | { ok: false; error: string };

type AccessLookup =
  | { ok: true; access: RoleAccessContext }
  | { ok: false; error: string };

async function resolveAccess(
  auth: AuthContext,
  access?: RoleAccessContext,
): Promise<AccessLookup> {
  if (access) return { ok: true, access };
  const result = await getUserRoleAccess(auth);
  if (!result.ok) return { ok: false, error: ROLE_LOOKUP_ERROR };
  return { ok: true, access: result.access };
}

/**
 * グローバル管理者のみ許可。
 * システム設定変更・ユーザー作成など、影響範囲の広い操作に使用する。
 */
export async function verifyAdmin(
  auth: AuthContext,
  access?: RoleAccessContext,
): Promise<PermissionCheckResult> {
  const lookup = await resolveAccess(auth, access);
  if (!lookup.ok) return lookup;
  if (!isAdmin(lookup.access)) {
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
  const lookup = await resolveAccess(auth, access);
  if (!lookup.ok) return lookup;
  if (!canManageMembers(lookup.access)) {
    return { ok: false, error: "権限がありません" };
  }
  return { ok: true };
}

/**
 * Verify that the user has permission to write club-wide transactions.
 * Returns PermissionCheckResult for use in server actions.
 */
export async function verifyClubTransactionPermission(
  auth: AuthContext,
  access?: RoleAccessContext,
): Promise<PermissionCheckResult> {
  const lookup = await resolveAccess(auth, access);
  if (!lookup.ok) return lookup;
  if (!canCreateClubTransaction(lookup.access)) {
    return {
      ok: false,
      error: "部全体取引の作成には会計担当または管理者権限が必要です",
    };
  }
  return { ok: true };
}
