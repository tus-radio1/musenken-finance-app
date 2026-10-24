"use server";

import { createClient } from "@/utils/supabase/server";
import { loginAccountRateLimiter, loginRateLimiter } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { deriveEmail } from "@/lib/account";

/**
 * Server-side login action with rate limiting.
 * Enforces both IP and account limits within a 15-minute fixed window.
 */
export async function loginAction(studentNumber: string, password: string) {
  const normalizedStudentNumber = studentNumber.trim();
  // Input validation
  if (!/^[0-9]{7}$/.test(normalizedStudentNumber)) {
    return { error: "学籍番号は7桁の数字で入力してください" };
  }

  if (!password || password.length === 0) {
    return { error: "パスワードを入力してください" };
  }

  const ip = await getClientIp();
  const results = await Promise.all([
    loginRateLimiter.check(ip),
    loginAccountRateLimiter.check(normalizedStudentNumber),
  ]);
  const blockedResults = results.filter((result) => !result.success);
  if (blockedResults.length > 0) {
    const retryAfterSeconds = Math.ceil(
      (Math.max(...blockedResults.map((result) => result.resetAt)) - Date.now()) / 1000,
    );
    const retryMinutes = Math.ceil(retryAfterSeconds / 60);
    return {
      error: `ログイン試行回数の上限に達しました。${retryMinutes}分後に再試行してください。`,
    };
  }

  // Authenticate via Supabase
  const supabase = await createClient();
  const email = deriveEmail(normalizedStudentNumber, true);

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "学籍番号またはパスワードが正しくありません" };
  }

  return { success: true };
}
