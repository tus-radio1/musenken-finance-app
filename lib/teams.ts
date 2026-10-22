/**
 * 画面で選択できる会計グループ（チーム）一覧。
 *
 * 表示できるグループの判定は lib/roles/permissions.ts の canViewGroup に
 * 任せる（管理者・会計: 全グループ、部長・副部長: 全グループを閲覧、
 * それ以外: type が general / 未設定のグループと所属グループ）。
 */

import "server-only";

import { getAccountingGroups } from "@/lib/cache";
import {
  canViewGroup,
  hasAllNonClubGroupAccess,
  isOpenGroup,
} from "@/lib/roles/permissions";
import type { RoleAccessContext } from "@/lib/roles/types";

export type TeamInfo = {
  id: string;
  name: string;
  /** accounting_groups.type as stored ("general" / "leader" / "club" / null). */
  type: string | null;
};

export type AccountingGroupRow = {
  id: string;
  name: string;
  is_active: boolean | null;
  type: string | null;
};

/**
 * Visible groups in their given order. With scoped access (regular members),
 * open groups come first, then the member's own groups (previous behaviour).
 */
export function selectVisibleTeams(
  access: RoleAccessContext,
  groups: readonly AccountingGroupRow[],
  options: { includeInactive?: boolean } = {},
): TeamInfo[] {
  const visible = groups
    .filter((g) => options.includeInactive || g.is_active !== false)
    .filter((g) => canViewGroup(access, g))
    .map((g) => ({ id: g.id, name: g.name, type: g.type }));

  if (hasAllNonClubGroupAccess(access)) return visible;
  return [
    ...visible.filter((t) => isOpenGroup(t)),
    ...visible.filter((t) => !isOpenGroup(t)),
  ];
}

export async function getUserTeams(
  access: RoleAccessContext,
): Promise<TeamInfo[]> {
  const groups = await getAccountingGroups();
  return selectVisibleTeams(access, groups);
}
