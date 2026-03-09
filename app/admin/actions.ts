"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/server";
import {
  extractStudentNumberFromUser,
  findProfileIdByStudentNumber,
} from "@/lib/account";

// グローバル権限の変更
// グローバル管理者権限の付与/解除（roles: type='admin', accounting_group_id null）
export async function setGlobalAdmin(userId: string, enable: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  if (!profileId) return { error: "Unauthorized" };

  // 呼び出し者がadminか確認
  const { data: ur } = await supabase
    .from("user_roles")
    .select("roles(type)")
    .eq("user_id", profileId);
  const isAdmin = (ur || []).some((x: any) => x.roles?.type === "admin");
  if (!isAdmin) return { error: "Forbidden" };

  const admin = createAdminClient();
  // 既存のadminロール（グローバル）を取得/作成
  const { data: globalAdminRoles } = await admin
    .from("roles")
    .select("id")
    .eq("type", "admin")
    .is("accounting_group_id", null);
  let roleId = globalAdminRoles?.[0]?.id as string | undefined;
  if (!roleId) {
    const { data: created, error: roleErr } = await admin
      .from("roles")
      .insert({
        name: "Global Admin",
        type: "admin",
        accounting_group_id: null,
      })
      .select("id")
      .single();
    if (roleErr) {
      console.error(roleErr);
      return { error: "ロール作成に失敗しました" };
    }
    roleId = created.id;
  }

  if (enable) {
    const { error } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role_id: roleId });
    if (error) {
      console.error(error);
      return { error: "権限付与に失敗しました" };
    }
  } else {
    const { error } = await admin
      .from("user_roles")
      .delete()
      .match({ user_id: userId, role_id: roleId });
    if (error) {
      console.error(error);
      return { error: "権限解除に失敗しました" };
    }
  }

  revalidatePath("/admin/users");
  return { success: true };
}

// チーム所属の追加・更新
// グループロールの付与/変更（roles: type in ['general','leader'], accounting_group_id=groupId）
export async function assignGroupRole(
  userId: string,
  groupId: string,
  roleType: "general" | "leader"
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  if (!profileId) return { error: "Unauthorized" };
  const { data: ur } = await supabase
    .from("user_roles")
    .select("roles(type)")
    .eq("user_id", profileId);
  const isAdmin = (ur || []).some((x: any) => x.roles?.type === "admin");
  if (!isAdmin) return { error: "Forbidden" };

  const admin = createAdminClient();
  // 対象グループの既存ロールを取得（general/leader）
  const { data: existingRoles } = await admin
    .from("roles")
    .select("id, type")
    .eq("accounting_group_id", groupId);

  // roleType に対応するロールが無ければ作成
  let targetRoleId = existingRoles?.find((r: any) => r.type === roleType)
    ?.id as string | undefined;
  if (!targetRoleId) {
    const { data: created, error: roleErr } = await admin
      .from("roles")
      .insert({ name: roleType, type: roleType, accounting_group_id: groupId })
      .select("id")
      .single();
    if (roleErr) {
      console.error(roleErr);
      return { error: "ロール作成に失敗しました" };
    }
    targetRoleId = created.id;
  }

  // 既存のそのグループに紐づくユーザーのロール割当を全て削除
  const roleIdsOfGroup = (existingRoles || []).map((r: any) => r.id);
  if (roleIdsOfGroup.length > 0) {
    const { error: delErr } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .in("role_id", roleIdsOfGroup);
    if (delErr) {
      console.error(delErr);
      return { error: "既存割当の削除に失敗しました" };
    }
  }

  // 新しいロールを割当
  const { error } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role_id: targetRoleId });
  if (error) {
    console.error(error);
    return { error: "ロール割当に失敗しました" };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

// チーム所属の解除
export async function removeGroupRole(userId: string, groupId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  if (!profileId) return { error: "Unauthorized" };
  const { data: ur } = await supabase
    .from("user_roles")
    .select("roles(type)")
    .eq("user_id", profileId);
  const isAdmin = (ur || []).some((x: any) => x.roles?.type === "admin");
  if (!isAdmin) return { error: "Forbidden" };

  const admin = createAdminClient();
  const { data: rolesOfGroup } = await admin
    .from("roles")
    .select("id")
    .eq("accounting_group_id", groupId);
  const roleIds = (rolesOfGroup || []).map((r: any) => r.id);
  if (roleIds.length === 0) {
    revalidatePath("/admin/users");
    return { success: true };
  }
  const { error } = await admin
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .in("role_id", roleIds);
  if (error) {
    console.error(error);
    return { error: "ロール削除に失敗しました" };
  }
  revalidatePath("/admin/users");
  return { success: true };
}
