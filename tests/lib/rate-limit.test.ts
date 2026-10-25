import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRateLimiter, loginAccountRateLimiter, loginRateLimiter,
  passwordResetRateLimiter, uploadRateLimiter,
} from "@/lib/rate-limit";

const { rpc, admin } = vi.hoisted(() => ({ rpc: vi.fn(), admin: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({ createAdminClient: admin }));
const resetAt = "2026-10-24T12:15:00+00:00";

beforeEach(() => {
  vi.resetAllMocks();
  admin.mockReturnValue({ rpc });
  rpc.mockResolvedValue({ data: [{ allowed: true, remaining: 4, reset_at: resetAt }], error: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("persistent rate limiter", () => {
  it.each([
    [loginRateLimiter, "login-ip", 20, 900],
    [loginAccountRateLimiter, "login-account", 5, 900],
    [uploadRateLimiter, "upload", 10, 3600],
    [passwordResetRateLimiter, "password-reset", 3, 900],
  ])("calls the RPC with the configured %s bucket", async (limiter, bucket, max, seconds) => {
    await limiter.check("test-key");
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_bucket: bucket, p_key: "test-key", p_max: max, p_window_seconds: seconds,
    });
  });

  it("maps an allowed RPC result to the existing public API", async () => {
    expect(await loginAccountRateLimiter.check("9900001")).toEqual({
      success: true, remaining: 4, resetAt: Date.parse(resetAt),
    });
  });

  it("maps an exhausted RPC result", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: false, remaining: 0, reset_at: resetAt }], error: null });
    expect(await loginAccountRateLimiter.check("9900001")).toEqual({
      success: false, remaining: 0, resetAt: Date.parse(resetAt),
    });
  });

  it.each(["rpc-error", "transport-error", "missing-result", "client-error"])("fails open and logs without keys on %s", async (failure) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    if (failure === "rpc-error") rpc.mockResolvedValue({ data: null, error: { message: "secret-key" } });
    if (failure === "transport-error") rpc.mockRejectedValue(new Error("secret-key"));
    if (failure === "missing-result") rpc.mockResolvedValue({ data: [], error: null });
    if (failure === "client-error") admin.mockImplementation(() => { throw new Error("secret-key"); });
    const limiter = createRateLimiter("test", { maxRequests: 5, windowMs: 900_000 });
    expect(await limiter.check("secret-key")).toEqual({
      success: true, remaining: 5, resetAt: Date.now() + 900_000,
    });
    expect(log).toHaveBeenCalledExactlyOnceWith("[rate-limit] test: RPC failed; allowing request");
  });
});
