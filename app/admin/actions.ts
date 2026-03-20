"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import {
  extractStudentNumberFromUser,
  findProfileIdByStudentNumber,
} from "@/lib/account";
import {
  setGlobalAdminSchema,
  assignGroupRoleSchema,
  removeGroupRoleSchema,
} from "@/lib/validations";

// --- Role type ---
type RoleRow = {
  type?: string | null;
};

type UserRoleRow = {
  roles?: RoleRow | null;
};

async function verifyAdmin(): Promise<{
  ok: boolean;
  error?: string;
  profileId?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "認証が必要です" };

  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  if (!profileId) return { ok: false, error: "認証が必要です" };

  const { data: ur } = await supabase
    .from("user_roles")
    .select("roles(type)")
    .eq("user_id", profileId);
  const isAdmin = (ur as UserRoleRow[] || []).some(
    (x) => x.roles?.type === "admin",
  );
  if (!isAdmin) return { ok: false, error: "管理者権限が必要です" };

  return { ok: true, profileId };
}

// グローバル管理者権限の付与/解除
export async function setGlobalAdmin(userId: string, enable: boolean) {
  const validation = setGlobalAdminSchema.safeParse({ userId, enable });
  if (!validation.success) {
    return { error: "入力データが不正です" };
  }

  const adminCheck = await verifyAdmin();
  if (!adminCheck.ok) return { error: adminCheck.error };

  const supabase = await createClient();

  const { data: globalAdminRoles } = await supabase
    .from("roles")
    .select("id")
    .eq("type", "admin")
    .is("accounting_group_id", null);
  let roleId = globalAdminRoles?.[0]?.id as string | undefined;
  if (!roleId) {
    const { data: created, error: roleErr } = await supabase
      .from("roles")
      .insert({
        name: "Global Admin",
        type: "admin",
        accounting_group_id: null,
      })
      .select("id")
      .single();
    if (roleErr || !created) {
      console.error("[setGlobalAdmin] Role creation error:", roleErr);
      return { error: "操作に失敗しました。しばらくしてから再試行してください。" };
    }
    roleId = created.id;
  }

  if (enable) {
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role_id: roleId });
    if (error) {
      console.error("[setGlobalAdmin] Insert error:", error);
      return { error: "権限付与に失敗しました" };
    }
  } else {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .match({ user_id: userId, role_id: roleId });
    if (error) {
      console.error("[setGlobalAdmin] Delete error:", error);
      return { error: "権限解除に失敗しました" };
    }
  }

  revalidatePath("/admin/users");
  return { success: true };
}

// グループロールの付与/変更
export async function assignGroupRole(
  userId: string,
  groupId: string,
  roleType: "general" | "leader",
) {
  const validation = assignGroupRoleSchema.safeParse({
    userId,
    groupId,
    roleType,
  });
  if (!validation.success) {
    return { error: "入力データが不正です" };
  }

  const adminCheck = await verifyAdmin();
  if (!adminCheck.ok) return { error: adminCheck.error };

  const supabase = await createClient();

  const { data: existingRoles } = await supabase
    .from("roles")
    .select("id, type")
    .eq("accounting_group_id", groupId);

  type ExistingRoleRow = { id: string; type: string };
  let targetRoleId = (existingRoles as ExistingRoleRow[] | null)?.find(
    (r) => r.type === roleType,
  )?.id as string | undefined;

  if (!targetRoleId) {
    const { data: created, error: roleErr } = await supabase
      .from("roles")
      .insert({ name: roleType, type: roleType, accounting_group_id: groupId })
      .select("id")
      .single();
    if (roleErr || !created) {
      console.error("[assignGroupRole] Role creation error:", roleErr);
      return { error: "操作に失敗しました。しばらくしてから再試行してください。" };
    }
    targetRoleId = created.id;
  }

  const roleIdsOfGroup = (existingRoles as ExistingRoleRow[] || []).map(
    (r) => r.id,
  );
  if (roleIdsOfGroup.length > 0) {
    const { error: delErr } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .in("role_id", roleIdsOfGroup);
    if (delErr) {
      console.error("[assignGroupRole] Delete error:", delErr);
      return { error: "既存割当の削除に失敗しました" };
    }
  }

  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: userId, role_id: targetRoleId });
  if (error) {
    console.error("[assignGroupRole] Insert error:", error);
    return { error: "ロール割当に失敗しました" };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

// チーム所属の解除
export async function removeGroupRole(userId: string, groupId: string) {
  const validation = removeGroupRoleSchema.safeParse({ userId, groupId });
  if (!validation.success) {
    return { error: "入力データが不正です" };
  }

  const adminCheck = await verifyAdmin();
  if (!adminCheck.ok) return { error: adminCheck.error };

  const supabase = await createClient();

  const { data: rolesOfGroup } = await supabase
    .from("roles")
    .select("id")
    .eq("accounting_group_id", groupId);

  type RoleIdRow = { id: string };
  const roleIds = (rolesOfGroup as RoleIdRow[] || []).map((r) => r.id);
  if (roleIds.length === 0) {
    revalidatePath("/admin/users");
    return { success: true };
  }

  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .in("role_id", roleIds);
  if (error) {
    console.error("[removeGroupRole] Delete error:", error);
    return { error: "ロール削除に失敗しました" };
  }

  revalidatePath("/admin/users");
  return { success: true };
}
