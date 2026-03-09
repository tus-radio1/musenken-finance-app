"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/server";
import { createClient } from "@/utils/supabase/server";
import {
  createUserSchema,
  deriveEmail,
  deriveInitialPassword,
  extractStudentNumberFromUser,
  findProfileIdByStudentNumber,
  type CreateUserInput,
} from "@/lib/account";

export async function adminCreateUser(raw: unknown) {
  // 呼び出しユーザーの権限確認（admin のみ許可）
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" } as const;
  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  if (!profileId) return { error: "Unauthorized" } as const;

  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("roles(type)")
    .eq("user_id", profileId);
  const isAdmin = (userRoles || []).some(
    (ur: any) => ur.roles?.type === "admin"
  );
  if (!isAdmin) return { error: "Forbidden" } as const;

  const input = createUserSchema.parse(raw);
  const admin = createAdminClient();

  const email = deriveEmail(input.student_number, input.useCampusEmail);
  const password = deriveInitialPassword(input.student_number);

  // 1) 認証ユーザー作成（メール確認は不要とする）
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

  // 2) profiles に同期
  const { error: profileErr } = await admin.from("profiles").upsert(
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
  return { success: true, userId } as const;
}

export async function adminResetPassword(userId: string, newPassword: string) {
  // 呼び出しユーザーの権限確認
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" } as const;
  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  if (!profileId) return { error: "Unauthorized" } as const;

  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("roles(type)")
    .eq("user_id", profileId);
  const isAdmin = (userRoles || []).some(
    (ur: any) => ur.roles?.type === "admin"
  );
  if (!isAdmin) return { error: "Forbidden" } as const;

  const schema = z
    .object({ userId: z.string().uuid(), newPassword: z.string().min(8) })
    .parse({ userId, newPassword });

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(schema.userId, {
    password: schema.newPassword,
  });
  if (error) {
    console.error(error);
    return { error: "パスワードの更新に失敗しました" } as const;
  }
  return { success: true } as const;
}
