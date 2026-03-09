"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/utils/supabase/server";
import {
  createUserSchema,
  deriveEmail,
  deriveInitialPassword,
  extractStudentNumberFromUser,
  findProfileIdByStudentNumber,
} from "@/lib/account";

// --- 権限チェック ---
async function checkManagePermission(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  if (!profileId) return { ok: false, error: "Unauthorized" };

  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("roles(name, type)")
    .eq("user_id", profileId);

  const hasAccess = (userRoles || []).some((ur: any) => {
    const role = ur.roles;
    if (!role) return false;
    if (role.type === "admin") return true;
    if (["部長", "副部長", "会計"].includes(role.name)) return true;
    return false;
  });

  if (!hasAccess) return { ok: false, error: "権限がありません" };
  return { ok: true };
}

// --- 部員追加 ---
export async function addMember(raw: {
  name: string;
  student_number: string;
  grade: number;
}) {
  const perm = await checkManagePermission();
  if (!perm.ok) return { error: perm.error } as const;

  const input = createUserSchema.parse({ ...raw, useCampusEmail: true });
  const admin = createAdminClient();

  const email = deriveEmail(input.student_number, true);
  const password = deriveInitialPassword(input.student_number);

  // 1) Auth ユーザー作成
  const { data: created, error: createErr } = await admin.auth.admin.createUser(
    {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: input.name,
        student_number: input.student_number,
        grade: input.grade,
      },
    },
  );
  if (createErr || !created.user) {
    console.error(createErr);
    return { error: "ユーザー作成に失敗しました" } as const;
  }

  const userId = created.user.id;

  // 2) profiles に同期
  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      name: input.name,
      student_number: input.student_number,
      grade: input.grade,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (profileErr) {
    console.error(profileErr);
    return { error: "プロフィール作成に失敗しました" } as const;
  }

  // 3) 「一般部員」ロールを自動付与
  const { data: ippanRole } = await admin
    .from("roles")
    .select("id")
    .eq("name", "一般部員")
    .is("accounting_group_id", null)
    .single();

  if (ippanRole) {
    await admin
      .from("user_roles")
      .insert({ user_id: userId, role_id: ippanRole.id });
  }

  revalidatePath("/members/manage");
  return { success: true, userId } as const;
}

// --- 部員情報更新 ---
export async function updateMember(
  userId: string,
  data: {
    name: string;
    student_number: string;
    grade: number;
    role_ids: string[];
  },
) {
  const perm = await checkManagePermission();
  if (!perm.ok) return { error: perm.error } as const;

  const admin = createAdminClient();

  // 1) profiles 更新
  const { error: profileErr } = await admin
    .from("profiles")
    .update({
      name: data.name,
      student_number: data.student_number,
      grade: data.grade,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (profileErr) {
    console.error(profileErr);
    return { error: "プロフィール更新に失敗しました" } as const;
  }

  // 2) auth ユーザーの metadata も更新
  await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      name: data.name,
      student_number: data.student_number,
      grade: data.grade,
    },
  });

  // 3) ロール同期: 既存の全ロール割り当てを削除して再割り当て
  await admin.from("user_roles").delete().eq("user_id", userId);

  // 新しいロールを割り当て
  if (data.role_ids.length > 0) {
    const inserts = data.role_ids.map((roleId) => ({
      user_id: userId,
      role_id: roleId,
    }));
    const { error: insertErr } = await admin.from("user_roles").insert(inserts);
    if (insertErr) {
      console.error(insertErr);
      return { error: "ロール更新に失敗しました" } as const;
    }
  }

  revalidatePath("/members/manage");
  return { success: true } as const;
}

// --- 退部処理 ---
export async function retireMember(userId: string) {
  const perm = await checkManagePermission();
  if (!perm.ok) return { error: perm.error } as const;

  const admin = createAdminClient();

  // 1) grade を 0 に変更
  const { error: profileErr } = await admin
    .from("profiles")
    .update({ grade: 0, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (profileErr) {
    console.error(profileErr);
    return { error: "プロフィール更新に失敗しました" } as const;
  }

  // 2) 既存ロールを全削除
  await admin.from("user_roles").delete().eq("user_id", userId);

  // 3) OB・OG ロールを付与
  const { data: obRole } = await admin
    .from("roles")
    .select("id")
    .eq("name", "OB・OG")
    .single();

  if (obRole) {
    await admin
      .from("user_roles")
      .insert({ user_id: userId, role_id: obRole.id });
  }

  // 4) auth metadata も更新
  await admin.auth.admin.updateUserById(userId, {
    user_metadata: { grade: 0 },
  });

  revalidatePath("/members/manage");
  return { success: true } as const;
}

// --- 部員削除（完全削除） ---
export async function deleteMember(userId: string) {
  const perm = await checkManagePermission();
  if (!perm.ok) return { error: perm.error } as const;

  const admin = createAdminClient();

  // 1) user_roles を削除
  await admin.from("user_roles").delete().eq("user_id", userId);

  // 2) profiles を削除
  const { error: profileErr } = await admin
    .from("profiles")
    .delete()
    .eq("id", userId);
  if (profileErr) {
    console.error(profileErr);
    return { error: "プロフィール削除に失敗しました" } as const;
  }

  // 3) auth ユーザーを削除
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) {
    console.error(authErr);
    return { error: "認証ユーザー削除に失敗しました" } as const;
  }

  revalidatePath("/members/manage");
  return { success: true } as const;
}
