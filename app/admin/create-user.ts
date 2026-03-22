"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/server";
import {
  createUserSchema,
  deriveEmail,
  generateSecurePassword,
} from "@/lib/account";
import { adminResetPasswordSchema, validateInput } from "@/lib/validations";
import { passwordResetRateLimiter } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { resolveAuthContext } from "@/lib/auth/context";
import { verifyAdmin } from "@/lib/auth/permissions";

export async function adminCreateUser(raw: unknown) {
  // 呼び出しユーザーの権限確認（admin のみ許可）
  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error } as const;
  const auth = authResult.context;

  const adminCheck = await verifyAdmin(auth);
  if (!adminCheck.ok) return { error: adminCheck.error } as const;

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
  const { error: profileErr } = await auth.supabase.from("profiles").upsert(
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
  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error } as const;
  const auth = authResult.context;

  const adminCheck = await verifyAdmin(auth);
  if (!adminCheck.ok) return { error: adminCheck.error } as const;

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
