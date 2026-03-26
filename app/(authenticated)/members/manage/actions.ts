"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/server";
import {
  createUserSchema,
  deriveEmail,
  generateSecurePassword,
} from "@/lib/account";
import { resolveAuthContext } from "@/lib/auth/context";
import { verifyAdmin, verifyManageMembersPermission } from "@/lib/auth/permissions";
import { ROLE_NAMES_JA } from "@/lib/roles/constants";
import { logAuditEvent } from "@/lib/audit-log";
import { passwordResetRateLimiter } from "@/lib/rate-limit";
import { headers } from "next/headers";
import {
  addMemberSchema,
  updateMemberSchema,
  memberIdSchema,
  validateInput,
} from "@/lib/validations";

// --- 部員追加 ---
export async function addMember(raw: {
  name: string;
  student_number: string;
  grade: number;
}) {
  const memberValidation = validateInput(addMemberSchema, raw);
  if (!memberValidation.success) {
    return { error: "入力データが不正です" } as const;
  }

  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error } as const;

  const auth = authResult.context;
  const perm = await verifyManageMembersPermission(auth);
  if (!perm.ok) return { error: perm.error } as const;

  const parsed = createUserSchema.safeParse({ ...raw, useCampusEmail: true });
  if (!parsed.success) {
    return { error: "入力データが不正です" } as const;
  }
  const input = parsed.data;
  const admin = createAdminClient();

  const email = deriveEmail(input.student_number, true);
  const password = generateSecurePassword();

  // 1) Auth user creation - requires admin client for auth.admin.*
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

  // 2) profiles に同期 - uses RLS-respecting client
  const { error: profileErr } = await auth.supabase.from("profiles").upsert(
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

  // 3) 「仮部員」ロールを自動付与 - uses RLS-respecting client
  const { data: kariRole } = await auth.supabase
    .from("roles")
    .select("id")
    .eq("name", ROLE_NAMES_JA.PROVISIONAL_MEMBER)
    .is("accounting_group_id", null)
    .single();

  if (kariRole) {
    const { error: roleAssignErr } = await auth.supabase
      .from("user_roles")
      .insert({ user_id: userId, role_id: kariRole.id });
    if (roleAssignErr) {
      console.error("[addMember] Role assignment error:", roleAssignErr);
      // User was created but role assignment failed - log but don't block
    }
  }

  revalidatePath("/members/manage");
  revalidatePath("/members");
  return { success: true, userId, initialPassword: password } as const;
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
  const memberValidation = validateInput(updateMemberSchema, { userId, data });
  if (!memberValidation.success) {
    return { error: "入力データが不正です" } as const;
  }

  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error } as const;

  const auth = authResult.context;
  const perm = await verifyManageMembersPermission(auth);
  if (!perm.ok) return { error: perm.error } as const;

  const admin = createAdminClient();

  // 1) profiles 更新 - uses RLS-respecting client
  const { error: profileErr } = await auth.supabase
    .from("profiles")
    .update({
      name: data.name,
      student_number: data.student_number,
      grade: data.grade,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .is("deleted_at", null);
  if (profileErr) {
    console.error(profileErr);
    return { error: "プロフィール更新に失敗しました" } as const;
  }

  // 2) auth user metadata update - requires admin client for auth.admin.*
  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      name: data.name,
      student_number: data.student_number,
      grade: data.grade,
    },
  });
  if (authErr) {
    console.error("[updateMember] Auth metadata update error:", authErr);
    return { error: "ユーザー情報の更新に失敗しました" } as const;
  }

  // 3) ロール同期: 既存の全ロール割り当てを削除して再割り当て - uses RLS-respecting client
  const { error: roleDelErr } = await auth.supabase.from("user_roles").delete().eq("user_id", userId);
  if (roleDelErr) {
    console.error("[updateMember] Role deletion error:", roleDelErr);
    return { error: "ロールの更新に失敗しました" } as const;
  }

  // 新しいロールを割り当て
  if (data.role_ids.length > 0) {
    const inserts = data.role_ids.map((roleId) => ({
      user_id: userId,
      role_id: roleId,
    }));
    const { error: insertErr } = await auth.supabase.from("user_roles").insert(inserts);
    if (insertErr) {
      console.error(insertErr);
      return { error: "ロール更新に失敗しました" } as const;
    }
  }

  revalidatePath("/members/manage");
  revalidatePath("/members");
  return { success: true } as const;
}

// --- 退部処理 ---
export async function retireMember(userId: string) {
  const idValidation = validateInput(memberIdSchema, { userId });
  if (!idValidation.success) {
    return { error: "入力データが不正です" } as const;
  }

  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error } as const;

  const auth = authResult.context;
  const perm = await verifyManageMembersPermission(auth);
  if (!perm.ok) return { error: perm.error } as const;

  const admin = createAdminClient();

  // 1) grade を 0 に変更 - uses RLS-respecting client
  const { error: profileErr } = await auth.supabase
    .from("profiles")
    .update({ grade: 0, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .is("deleted_at", null);
  if (profileErr) {
    console.error(profileErr);
    return { error: "プロフィール更新に失敗しました" } as const;
  }

  // 2) 既存ロールを全削除 - uses RLS-respecting client
  const { error: roleDelErr } = await auth.supabase.from("user_roles").delete().eq("user_id", userId);
  if (roleDelErr) {
    console.error("[retireMember] Role deletion error:", roleDelErr);
    return { error: "ロールの削除に失敗しました" } as const;
  }

  // 3) OB・OG ロールを付与 - uses RLS-respecting client
  const { data: obRole } = await auth.supabase
    .from("roles")
    .select("id")
    .eq("name", ROLE_NAMES_JA.ALUMNI)
    .single();

  if (obRole) {
    const { error: obRoleErr } = await auth.supabase
      .from("user_roles")
      .insert({ user_id: userId, role_id: obRole.id });
    if (obRoleErr) {
      console.error("[retireMember] OB role assignment error:", obRoleErr);
      return { error: "OB・OGロールの付与に失敗しました" } as const;
    }
  }

  // 4) auth metadata update - requires admin client for auth.admin.*
  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { grade: 0 },
  });
  if (authErr) {
    console.error("[retireMember] Auth metadata update error:", authErr);
    return { error: "ユーザー情報の更新に失敗しました" } as const;
  }

  revalidatePath("/members/manage");
  revalidatePath("/members");
  return { success: true } as const;
}

// --- 部員削除（ソフトデリート） ---
export async function deleteMember(userId: string) {
  const idValidation = validateInput(memberIdSchema, { userId });
  if (!idValidation.success) {
    return { error: "入力データが不正です" } as const;
  }

  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error } as const;

  const auth = authResult.context;
  const perm = await verifyManageMembersPermission(auth);
  if (!perm.ok) return { error: perm.error } as const;

  const admin = createAdminClient();

  // Fetch current profile data for audit log before soft delete
  const { data: oldProfile } = await auth.supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .is("deleted_at", null)
    .single();

  if (!oldProfile) {
    return { error: "対象のプロフィールが見つかりません" } as const;
  }

  // 1) user_roles: Physical delete is acceptable for junction table rows.
  //    These are not financial records and will be recreated if the user is restored.
  const { error: roleDelErr } = await auth.supabase.from("user_roles").delete().eq("user_id", userId);
  if (roleDelErr) {
    console.error("[deleteMember] Role deletion error:", roleDelErr);
    return { error: "ロールの削除に失敗しました" } as const;
  }

  // 2) profiles: Soft delete by setting deleted_at instead of physical deletion.
  //    This preserves financial record references (transactions, subsidies).
  const deletedAt = new Date().toISOString();
  const { error: profileErr } = await auth.supabase
    .from("profiles")
    .update({ deleted_at: deletedAt, updated_at: deletedAt })
    .eq("id", userId)
    .is("deleted_at", null);
  if (profileErr) {
    console.error(profileErr);
    return { error: "プロフィール削除に失敗しました" } as const;
  }

  // 3) Auth user: Physical deletion is kept intentionally.
  //    The Supabase auth system is separate from financial records.
  //    Soft-deleted profile preserves the data trail; the auth account
  //    is removed so the user can no longer log in.
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) {
    console.error(authErr);
    return { error: "認証ユーザー削除に失敗しました" } as const;
  }

  // 4) Audit log: Record the soft delete event using auth.profileId
  await logAuditEvent({
    tableName: "profiles",
    recordId: userId,
    action: "SOFT_DELETE",
    oldData: oldProfile as Record<string, unknown>,
    newData: { deleted_at: deletedAt },
    changedBy: auth.profileId,
  });

  revalidatePath("/members/manage");
  revalidatePath("/members");
  return { success: true } as const;
}

// --- パスワードリセット ---
export async function resetPasswordMember(userId: string) {
  const idValidation = validateInput(memberIdSchema, { userId });
  if (!idValidation.success) {
    return { error: "入力データが不正です" } as const;
  }

  // Rate limiting: 3 attempts per 15 minutes per IP
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip") ||
    "unknown";
  const rateLimitResult = passwordResetRateLimiter.check(ip);
  if (!rateLimitResult.success) {
    const retryMinutes = Math.ceil(
      (rateLimitResult.resetAt - Date.now()) / 1000 / 60,
    );
    return {
      error: `パスワードリセットの試行回数上限に達しました。${retryMinutes}分後に再試行してください。`,
    } as const;
  }

  // Adminのみリセット可能
  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error } as const;

  const auth = authResult.context;
  const adminCheck = await verifyAdmin(auth);
  if (!adminCheck.ok) return { error: adminCheck.error } as const;

  const newPassword = generateSecurePassword();

  const admin = createAdminClient();
  const { error: resetErr } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (resetErr) {
    console.error(resetErr);
    return { error: "パスワードリセットに失敗しました" } as const;
  }

  return { success: true, newPassword } as const;
}
