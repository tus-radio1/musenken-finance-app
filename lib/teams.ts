/**
 * サイドバー用のチーム(会計グループ)一覧取得。
 *
 * ユーザーのロールに応じて閲覧可能な会計グループを返す。
 * 管理者・会計・部長・副部長は全グループ、一般部員は general タイプ+所属班のみ。
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_TYPES, ROLE_NAMES_JA } from "@/lib/roles/constants";
import { getAccountingGroups } from "@/lib/cache";
import type { Database } from "@/lib/database.types";

export type TeamInfo = {
  id: string;
  name: string;
  type: "general" | "leader";
};

export async function getUserTeams(
  supabase: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<{
  teams: TeamInfo[];
  isGlobalAdmin: boolean;
  isAccountingUser: boolean;
  isFullAccess: boolean;
  roleGroupIds: string[];
}> {
  let isGlobalAdmin = false;
  let isAccountingUser = false;
  const myTeams: TeamInfo[] = [];

  // NOTE: profiles.role カラムは migration 20260322130000 で削除済み。
  // 会計ロール判定は user_roles 経由で行う。
  const [{ data: userRoles }, categories] =
    await Promise.all([
      supabase
        .from("user_roles")
        .select("roles(name, type, accounting_group_id)")
        .eq("user_id", userId),
      getAccountingGroups(),
    ]);

  type Role = {
    name: string | null;
    type: string | null;
    accounting_group_id: string | null;
  };

  const roles: Role[] = (userRoles || []).flatMap((ur) => {
    const rr = (ur as unknown as { roles?: Role | Role[] | null }).roles;
    if (Array.isArray(rr)) return rr;
    return rr ? [rr] : [];
  });

  isGlobalAdmin = roles.some((r) => r.type === ROLE_TYPES.ADMIN);
  if (!isAccountingUser) {
    isAccountingUser = roles.some((r) => r?.name === ROLE_NAMES_JA.ACCOUNTING);
  }

  type AccountingGroup = { id: string; name: string; is_active: boolean; type: string | null };
  const safeCategories = ((categories || []) as AccountingGroup[]).filter(
    (c) => c.is_active !== false,
  );

  const isFullAccess =
    isAccountingUser ||
    isGlobalAdmin ||
    roles.some((r) => r?.name === ROLE_NAMES_JA.CHAIR || r?.name === ROLE_NAMES_JA.VICE_CHAIR);

  if (isFullAccess) {
    safeCategories.forEach((c) => {
      myTeams.push({ id: c.id, name: c.name, type: ROLE_TYPES.GENERAL as "general" });
    });
  } else {
    // 全ユーザーに general タイプのグループを表示
    // Use already-cached categories filtered by type and active status
    const generalGroups = safeCategories.filter(
      (c) => c.type === ROLE_TYPES.GENERAL || !c.type,
    );

    generalGroups.forEach((g) => {
      if (!myTeams.some((t) => t.id === g.id)) {
        myTeams.push({ id: g.id, name: g.name, type: ROLE_TYPES.GENERAL as "general" });
      }
    });

    // さらに所属班のグループを追加
    roles.forEach((r) => {
      const gid = r?.accounting_group_id ?? undefined;
      if (!gid) return;
      const cat = safeCategories.find((c) => c.id === gid);
      if (!cat) return;
      if (myTeams.some((t) => t.id === gid)) return;
      const type: "general" | "leader" =
        r.type === ROLE_TYPES.LEADER ? (ROLE_TYPES.LEADER as "leader") : (ROLE_TYPES.GENERAL as "general");
      myTeams.push({ id: gid, name: cat.name, type });
    });
  }

  const roleGroupIds = roles
    .filter((r) => r.accounting_group_id)
    .map((r) => r.accounting_group_id as string);

  return { teams: myTeams, isGlobalAdmin, isAccountingUser, isFullAccess, roleGroupIds };
}
