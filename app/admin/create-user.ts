"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/utils/supabase/server";
import {
  createUserSchema,
  deriveEmail,
  generateSecurePassword,
  extractStudentNumberFromUser,
  findProfileIdByStudentNumber,
} from "@/lib/account";
import { adminResetPasswordSchema, validateInput } from "@/lib/validations";
import { passwordResetRateLimiter } from "@/lib/rate-limit";
import { headers } from "next/headers";

// --- Role type ---
type UserRoleRow = {
  roles?: { type?: string | null } | null;
};

export async function adminCreateUser(raw: unknown) {
  // 呼び出しユーザーの権限確認（admin のみ許可）
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" } as const;
  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  if (!profileId) return { error: "認証が必要です" } as const;

  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("roles(type)")
    .eq("user_id", profileId);
  const isAdmin = (userRoles as UserRoleRow[] || []).some(
    (ur) => ur.roles?.type === "admin"
  );
  if (!isAdmin) return { error: "管理者権限が必要です" } as const;

  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "入力データが不正です" } as const;
  }
  const input = parsed.data;
  const admin = createAdminClient();

  const email = deriveEmail(input.student_number, input.useCampusEmail);
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
    }
  );
  if (createErr || !created.user) {
    console.error(createErr);
    return { error: "ユーザー作成に失敗しました" } as const;
  }

  const userId = created.user.id;

  // 2) profiles に同期 - uses RLS-respecting client
  const { error: profileErr } = await supabase.from("profiles").upsert(
    {
      id: userId,
      name: input.name,
      student_number: input.student_number,
      grade: input.grade,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (profileErr) {
    console.error(profileErr);
    return { error: "プロフィール作成に失敗しました" } as const;
  }

  revalidatePath("/admin/users");
  return { success: true, userId, initialPassword: password } as const;
}

export async function adminResetPassword(userId: string) {
  const validation = validateInput(adminResetPasswordSchema, { userId });
  if (!validation.success) {
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

  // 呼び出しユーザーの権限確認
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" } as const;
  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  if (!profileId) return { error: "認証が必要です" } as const;

  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("roles(type)")
    .eq("user_id", profileId);
  const isAdmin = (userRoles as UserRoleRow[] || []).some(
    (ur) => ur.roles?.type === "admin"
  );
  if (!isAdmin) return { error: "管理者権限が必要です" } as const;

  const newPassword = generateSecurePassword();

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(validation.data.userId, {
    password: newPassword,
  });
  if (error) {
    console.error(error);
    return { error: "パスワードの更新に失敗しました" } as const;
  }
  return { success: true, newPassword } as const;
}
