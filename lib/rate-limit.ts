/**
 * Simple in-memory rate limiter for server actions.
 *
 * Tracks request counts per key (e.g. IP address, user ID) within a
 * sliding time window. Designed for small-scale apps where a single
 * Node.js process handles all traffic.
 *
 * NOTE: This does NOT persist across server restarts or multiple
 * instances. For production clusters, use Redis-backed rate limiting.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  /** Maximum number of requests allowed within the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

// Periodic cleanup interval (5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer(): void {
  if (cleanupTimer !== null) {
    return;
  }
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const store of stores.values()) {
      for (const [key, entry] of store.entries()) {
        if (now >= entry.resetAt) {
          store.delete(key);
        }
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // Allow the Node.js process to exit even if the timer is active
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }
}

function getStore(name: string): Map<string, RateLimitEntry> {
  let store = stores.get(name);
  if (!store) {
    store = new Map();
    stores.set(name, store);
    ensureCleanupTimer();
  }
  return store;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Create a named rate limiter with the given options.
 *
 * Usage:
 * ```ts
 * const loginLimiter = createRateLimiter("login", {
 *   maxRequests: 5,
 *   windowMs: 15 * 60 * 1000, // 15 minutes
 * });
 *
 * // In a server action:
 * const result = loginLimiter.check(ipAddress);
 * if (!result.success) {
 *   return { error: "Too many attempts. Please try again later." };
 * }
 * ```
 */
export function createRateLimiter(
  name: string,
  options: RateLimiterOptions,
): { check: (key: string) => RateLimitResult } {
  const store = getStore(name);

  function check(key: string): RateLimitResult {
    const now = Date.now();
    const entry = store.get(key);

    // No existing entry or window has expired - start fresh
    if (!entry || now >= entry.resetAt) {
      const resetAt = now + options.windowMs;
      store.set(key, { count: 1, resetAt });
      return {
        success: true,
        remaining: options.maxRequests - 1,
        resetAt,
      };
    }

    // Within the current window
    if (entry.count < options.maxRequests) {
      entry.count += 1;
      return {
        success: true,
        remaining: options.maxRequests - entry.count,
        resetAt: entry.resetAt,
      };
    }

    // Rate limit exceeded
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  return { check };
}

// =============================================================================
// Pre-configured limiters for the application
// =============================================================================

/** Login: 5 attempts per 15 minutes per IP */
export const loginRateLimiter = createRateLimiter("login", {
  maxRequests: 5,
  windowMs: 15 * 60 * 1000,
});

/** File upload: 10 uploads per hour per user */
export const uploadRateLimiter = createRateLimiter("upload", {
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
});

/** Password reset: 3 attempts per 15 minutes per IP */
export const passwordResetRateLimiter = createRateLimiter("password-reset", {
  maxRequests: 3,
  windowMs: 15 * 60 * 1000,
});
