"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/server";

import {
  createUserSchema,
  deriveEmail,
  deriveInitialPassword,
  generateSecurePassword,
} from "@/lib/account";
import { resolveAuthContext, resolveAuthWithRoles } from "@/lib/auth/context";
import { verifyAdmin, verifyManageMembersPermission } from "@/lib/auth/permissions";
import { isDelegableRole, planRoleSync } from "@/lib/roles/assignment";
import { ROLE_NAMES_JA } from "@/lib/roles/constants";
import { toRoleAssignment } from "@/lib/roles/parse";
import { isAdmin } from "@/lib/roles/permissions";
import type { RoleAssignment } from "@/lib/roles/types";
import { logAuditEvent } from "@/lib/audit-log";
import { passwordResetRateLimiter } from "@/lib/rate-limit";
import { headers } from "next/headers";
import {
  addMemberSchema,
  updateMemberSchema,
  memberIdSchema,
  validateInput,
} from "@/lib/validations";

// GoTrue (Supabase Auth) may reject supplementary Unicode characters (U+10000+)
// in user_metadata. Preserve the original name only in the profiles table.
function sanitizeForGoTrue(name: string): string {
  return [...name]
    .map((ch) => {
      const cp = ch.codePointAt(0)!;
      return cp > 0xffff ? `[U+${cp.toString(16).toUpperCase()}]` : ch;
    })
    .join("");
}

type AdminClient = ReturnType<typeof createAdminClient>;

const PROTECTED_ROLE_ERROR = "このロールの変更には管理者権限が必要です";
const PROTECTED_TARGET_ERROR = "この部員の操作には管理者権限が必要です";
const ROLE_LOOKUP_ERROR = "操作に失敗しました。しばらくしてから再試行してください。";
const MEMBER_NOT_FOUND_ERROR = "対象の部員が見つからないか、更新できませんでした";

// Role ids currently assigned to the user, read with the service-role client so
// the result does not depend on the caller's RLS visibility.
async function fetchAssignedRoleIds(
  admin: AdminClient,
  userId: string,
): Promise<string[] | null> {
  const { data, error } = await admin
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId);
  if (error) {
    console.error("[members] Role assignment fetch error:", error);
    return null;
  }
  return (data ?? []).map((row) => row.role_id);
}

async function fetchRolesById(
  admin: AdminClient,
  roleIds: readonly string[],
): Promise<Record<string, RoleAssignment> | null> {
  if (roleIds.length === 0) return {};
  const { data, error } = await admin
    .from("roles")
    .select("id, name, type, accounting_group_id")
    .in("id", [...roleIds]);
  if (error) {
    console.error("[members] Role fetch error:", error);
    return null;
  }
  return Object.fromEntries(
    (data ?? []).map((role) => [role.id, toRoleAssignment(role)]),
  );
}

// The user's role ids (one snapshot) and whether a non-admin manager may
// retire/delete the user: only when every role is delegable. Callers must act
// on this same snapshot, never on a later read. Fail closed: null when roles
// cannot be read.
async function inspectTargetRoles(
  admin: AdminClient,
  userId: string,
): Promise<{ roleIds: string[]; manageableByNonAdmin: boolean } | null> {
  const roleIds = await fetchAssignedRoleIds(admin, userId);
  if (roleIds === null) return null;
  const rolesById = await fetchRolesById(admin, roleIds);
  if (rolesById === null) return null;
  return {
    roleIds,
    manageableByNonAdmin: roleIds.every((id) => isDelegableRole(rolesById[id])),
  };
}

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
  const password = deriveInitialPassword(input.student_number);

  // 1) Auth user creation - requires admin client for auth.admin.*
  const { data: created, error: createErr } = await admin.auth.admin.createUser(
    {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: sanitizeForGoTrue(input.name),
        student_number: input.student_number,
        grade: input.grade,
      },
    },
  );
  if (createErr || !created.user) {
    console.error(createErr);
    // Duplicate email = the derived email ({student_number}@...) is already
    // registered. Surface a specific message so the operator can correct the
    // student number instead of seeing a generic failure.
    if (createErr?.code === "email_exists") {
      return { error: "この学籍番号はすでに登録されています" } as const;
    }
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
  const input = memberValidation.data.data;

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error } as const;

  const auth = authResult.context;
  const access = authResult.access;
  const perm = await verifyManageMembersPermission(auth, access);
  if (!perm.ok) return { error: perm.error } as const;

  const admin = createAdminClient();

  // 0) ロール変更の可否を書き込み前に判定する。
  //    非管理者は権限に影響するロール（管理者・会計・部長・副部長・グループロール等）を
  //    付与・解除できない（lib/roles/assignment.ts 参照）。
  const currentRoleIds = await fetchAssignedRoleIds(admin, userId);
  if (currentRoleIds === null) {
    return { error: "ロールの更新に失敗しました" } as const;
  }
  const roleById = await fetchRolesById(admin, [
    ...new Set([...currentRoleIds, ...input.role_ids]),
  ]);
  if (roleById === null) {
    return { error: "ロールの更新に失敗しました" } as const;
  }
  const rolePlan = planRoleSync({
    actorIsAdmin: isAdmin(access),
    currentRoleIds,
    requestedRoleIds: input.role_ids,
    roleById,
  });
  if (!rolePlan.ok) {
    if (rolePlan.reason === "protected_role") {
      return { error: PROTECTED_ROLE_ERROR } as const;
    }
    return { error: "入力データが不正です" } as const;
  }

  // 1) profiles 更新 - service role: profiles の RLS は本人と管理者しか更新できず、
  //    部長・副部長・会計による更新は 0 行になっていた。権限は上で確認済み。
  //    1 行更新できなければ Auth・ロールには進まない。
  const { data: updatedProfiles, error: profileErr } = await admin
    .from("profiles")
    .update({
      name: input.name,
      student_number: input.student_number,
      grade: input.grade,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .is("deleted_at", null)
    .select("id");
  if (profileErr) {
    console.error(profileErr);
    return { error: "プロフィール更新に失敗しました" } as const;
  }
  if (!updatedProfiles || updatedProfiles.length !== 1) {
    return { error: MEMBER_NOT_FOUND_ERROR } as const;
  }

  // 2) auth user metadata update - requires admin client for auth.admin.*
  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      name: sanitizeForGoTrue(input.name),
      student_number: input.student_number,
      grade: input.grade,
    },
  });
  if (authErr) {
    console.error("[updateMember] Auth metadata update error:", authErr);
    return { error: "ユーザー情報の更新に失敗しました" } as const;
  }

  // 3) ロール同期: 差分のみ削除・追加する（判定済みの割り当て以外には触れない）
  //    - uses admin client to bypass RLS
  if (rolePlan.toRemove.length > 0) {
    const { error: roleDelErr } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .in("role_id", rolePlan.toRemove);
    if (roleDelErr) {
      console.error("[updateMember] Role deletion error:", roleDelErr);
      return { error: "ロールの更新に失敗しました" } as const;
    }
  }

  if (rolePlan.toAdd.length > 0) {
    const inserts = rolePlan.toAdd.map((roleId) => ({
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
  revalidatePath("/members");
  return { success: true } as const;
}

// --- 退部処理 ---
export async function retireMember(userId: string) {
  const idValidation = validateInput(memberIdSchema, { userId });
  if (!idValidation.success) {
    return { error: "入力データが不正です" } as const;
  }

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error } as const;

  const auth = authResult.context;
  const access = authResult.access;
  const perm = await verifyManageMembersPermission(auth, access);
  if (!perm.ok) return { error: perm.error } as const;

  const admin = createAdminClient();

  // 非管理者は権限ロール保持者（管理者・会計・部長・副部長・グループロール等）を
  // 操作できない（ロール剥奪・アカウント削除による権限奪取の防止）
  const actorIsAdmin = isAdmin(access);
  const targetRoles = await inspectTargetRoles(admin, userId);
  if (targetRoles === null) {
    return { error: ROLE_LOOKUP_ERROR } as const;
  }
  if (!actorIsAdmin && !targetRoles.manageableByNonAdmin) {
    return { error: PROTECTED_TARGET_ERROR } as const;
  }

  // Writes use the service-role client: profiles / user_roles RLS only lets
  // admins change other users, so a non-admin manager's writes touched 0 rows.
  // Permission (and S1) is checked above. Everything is read and validated
  // before the first write; atomicity of the steps is R6.

  // 0) OB・OG ロールと現在のロールを書き込み前に確認する
  const { data: obRole, error: obRoleFetchErr } = await admin
    .from("roles")
    .select("id, name, type, accounting_group_id")
    .eq("name", ROLE_NAMES_JA.ALUMNI)
    .maybeSingle();
  if (obRoleFetchErr || !obRole) {
    console.error("[retireMember] OB role fetch error:", obRoleFetchErr);
    return { error: ROLE_LOOKUP_ERROR } as const;
  }
  if (!actorIsAdmin && !isDelegableRole(toRoleAssignment(obRole))) {
    return { error: PROTECTED_ROLE_ERROR } as const;
  }
  // The snapshot validated above: roles granted after the check are untouched.
  const currentRoleIds = targetRoles.roleIds;

  // 1) grade を 0 に変更（1 行更新できなければ中止）
  const { data: updatedProfiles, error: profileErr } = await admin
    .from("profiles")
    .update({ grade: 0, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .is("deleted_at", null)
    .select("id");
  if (profileErr) {
    console.error(profileErr);
    return { error: "プロフィール更新に失敗しました" } as const;
  }
  if (!updatedProfiles || updatedProfiles.length !== 1) {
    return { error: MEMBER_NOT_FOUND_ERROR } as const;
  }

  // 2) OB・OG ロールを付与（付与済みなら何もしない）
  if (!currentRoleIds.includes(obRole.id)) {
    const { error: obRoleErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role_id: obRole.id });
    if (obRoleErr) {
      console.error("[retireMember] OB role assignment error:", obRoleErr);
      return { error: "OB・OGロールの付与に失敗しました" } as const;
    }
  }

  // 3) 確認済みの旧ロールだけを削除する（確認後に付与されたロールは消さない）
  const rolesToRemove = currentRoleIds.filter((id) => id !== obRole.id);
  if (rolesToRemove.length > 0) {
    const { error: roleDelErr } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .in("role_id", rolesToRemove);
    if (roleDelErr) {
      console.error("[retireMember] Role deletion error:", roleDelErr);
      return { error: "ロールの削除に失敗しました" } as const;
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

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error } as const;

  const auth = authResult.context;
  const access = authResult.access;
  const perm = await verifyManageMembersPermission(auth, access);
  if (!perm.ok) return { error: perm.error } as const;

  const admin = createAdminClient();

  // 非管理者は権限ロール保持者（管理者・会計・部長・副部長・グループロール等）を
  // 操作できない（ロール剥奪・アカウント削除による権限奪取の防止）
  if (!isAdmin(access)) {
    const targetRoles = await inspectTargetRoles(admin, userId);
    if (targetRoles === null) {
      return { error: ROLE_LOOKUP_ERROR } as const;
    }
    if (!targetRoles.manageableByNonAdmin) {
      return { error: PROTECTED_TARGET_ERROR } as const;
    }
  }

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
