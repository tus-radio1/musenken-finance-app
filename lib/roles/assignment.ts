/**
 * 部員管理画面からのロール割り当て変更の判定ロジック。
 *
 * updateMember はサービスロールで user_roles を書き換えるため、RLS に頼らず
 * ここで「誰がどのロールを付与・解除できるか」を判定する。
 *
 * ルール:
 *   - グローバル管理者は全ロールを付与・解除できる。
 *   - それ以外の部員管理権限保持者が付与・解除できるのは「委任可能ロール」のみ。
 *     委任可能ロール = lib/roles/permissions.ts の権限判定に一切影響しないロール
 *     （type = general、グループに属さない、部員管理ロール名でない）。
 *     管理者・会計・部長・副部長・グループロール・未知の type は管理者専用（fail closed）。
 *   - 存在しないロール ID の指定は拒否する。
 */

import { MANAGE_MEMBER_ROLE_NAMES, ROLE_TYPES } from "./constants";
import type { RoleAssignment } from "./types";

export type RoleSyncPlan =
  | { ok: true; toAdd: string[]; toRemove: string[] }
  | { ok: false; reason: "unknown_role" | "protected_role" };

/**
 * 部員管理権限（非管理者）でも付与・解除してよいロールか。
 * lib/roles/permissions.ts で権限に結びつく属性を一つでも持つロールは対象外
 * （tests/lib/roles-permissions.test.ts で検証）。
 */
export function isDelegableRole(role: RoleAssignment | undefined): boolean {
  if (!role) return false;
  if (role.type !== ROLE_TYPES.GENERAL) return false;
  if (role.accountingGroupId !== null) return false;
  return !(MANAGE_MEMBER_ROLE_NAMES as readonly string[]).includes(role.name);
}

export function planRoleSync(params: {
  actorIsAdmin: boolean;
  currentRoleIds: readonly string[];
  requestedRoleIds: readonly string[];
  roleById: Readonly<Record<string, RoleAssignment>>;
}): RoleSyncPlan {
  const { actorIsAdmin, roleById } = params;
  const current = new Set(params.currentRoleIds);
  const requested = new Set(params.requestedRoleIds);

  const hasUnknownRequested = [...requested].some(
    (id) => !Object.hasOwn(roleById, id),
  );
  if (hasUnknownRequested) {
    return { ok: false, reason: "unknown_role" };
  }

  const toAdd = [...requested].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !requested.has(id));

  if (!actorIsAdmin) {
    const touchesProtected = [...toAdd, ...toRemove].some(
      (id) => !isDelegableRole(roleById[id]),
    );
    if (touchesProtected) {
      return { ok: false, reason: "protected_role" };
    }
  }

  return { ok: true, toAdd, toRemove };
}
