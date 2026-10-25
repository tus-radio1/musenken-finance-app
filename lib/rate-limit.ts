import { createAdminClient } from "@/utils/supabase/server";

interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

/** Shared fixed-window counters, persisted across instances and deploys. */
export function createRateLimiter(
  name: string,
  options: RateLimiterOptions,
): { check: (key: string) => Promise<RateLimitResult> } {
  async function check(key: string): Promise<RateLimitResult> {
    try {
      const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
        p_bucket: name,
        p_key: key,
        p_max: options.maxRequests,
        p_window_seconds: Math.ceil(options.windowMs / 1000),
      });
      if (error) throw error;
      const result = data?.[0];
      if (!result) throw new Error("Missing rate limit result");
      return {
        success: result.allowed,
        remaining: result.remaining,
        resetAt: Date.parse(result.reset_at),
      };
    } catch {
      // All limiters fail open on DB/transport errors to preserve availability.
      // Supabase Auth retains its own limits. Never log IPs/account keys or
      // RPC error details, which may contain the request payload.
      console.error(`[rate-limit] ${name}: RPC failed; allowing request`);
      return {
        success: true,
        remaining: options.maxRequests,
        resetAt: Date.now() + options.windowMs,
      };
    }
  }
  return { check };
}

/** Login: 20 attempts per 15 minutes per IP, 5 per account. */
export const loginRateLimiter = createRateLimiter("login-ip", {
  maxRequests: 20,
  windowMs: 15 * 60 * 1000,
});

export const loginAccountRateLimiter = createRateLimiter("login-account", {
  maxRequests: 5,
  windowMs: 15 * 60 * 1000,
});

/** File upload: 10 uploads per hour per user. */
export const uploadRateLimiter = createRateLimiter("upload", {
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
});

/** Password reset: 3 attempts per 15 minutes per IP. */
export const passwordResetRateLimiter = createRateLimiter("password-reset", {
  maxRequests: 3,
  windowMs: 15 * 60 * 1000,
});
