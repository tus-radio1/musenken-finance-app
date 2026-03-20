"use server";

import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { loginRateLimiter } from "@/lib/rate-limit";
import { deriveEmail } from "@/lib/account";

/**
 * Server-side login action with rate limiting.
 * Enforces 5 attempts per 15 minutes per IP address.
 */
export async function loginAction(studentNumber: string, password: string) {
  // Input validation
  if (!/^[0-9]{7}$/.test(studentNumber)) {
    return { error: "学籍番号は7桁の数字で入力してください" };
  }

  if (!password || password.length === 0) {
    return { error: "パスワードを入力してください" };
  }

  // Rate limiting by IP
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip") ||
    "unknown";

  const rateLimitResult = loginRateLimiter.check(ip);
  if (!rateLimitResult.success) {
    const retryAfterSeconds = Math.ceil(
      (rateLimitResult.resetAt - Date.now()) / 1000,
    );
    const retryMinutes = Math.ceil(retryAfterSeconds / 60);
    return {
      error: `ログイン試行回数の上限に達しました。${retryMinutes}分後に再試行してください。`,
    };
  }

  // Authenticate via Supabase
  const supabase = await createClient();
  const email = deriveEmail(studentNumber, true);

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "学籍番号またはパスワードが正しくありません" };
  }

  return { success: true };
}
