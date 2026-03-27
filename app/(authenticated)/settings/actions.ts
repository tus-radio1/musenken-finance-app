"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import {
  updateUserPasswordSchema,
  validateInput,
} from "@/lib/validations";

export async function updateUserPassword(password: string) {
  const validation = validateInput(updateUserPasswordSchema, { password });
  if (!validation.success) {
    return {
      success: false,
      error: "パスワードは8文字以上で、大文字・小文字・数字を含む必要があります",
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    password: validation.data.password,
  });

  if (error) {
    console.error("[updateUserPassword] Auth update error:", error);
    return { success: false, error: "パスワードの更新に失敗しました" };
  }

  revalidatePath("/settings");
  return { success: true };
}
