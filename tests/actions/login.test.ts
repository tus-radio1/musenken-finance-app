import { beforeEach, describe, expect, it, vi } from "vitest";
import { loginAction } from "@/app/login/actions";

const { ipCheck, accountCheck, signIn, createClient, getClientIp } = vi.hoisted(() => ({
  ipCheck: vi.fn(), accountCheck: vi.fn(), signIn: vi.fn(), createClient: vi.fn(), getClientIp: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  loginRateLimiter: { check: ipCheck }, loginAccountRateLimiter: { check: accountCheck },
}));
vi.mock("@/lib/client-ip", () => ({ getClientIp }));
vi.mock("@/utils/supabase/server", () => ({ createClient }));

beforeEach(() => {
  vi.resetAllMocks();
  const allowed = { success: true, remaining: 1, resetAt: Date.now() + 900_000 };
  ipCheck.mockResolvedValue(allowed);
  accountCheck.mockResolvedValue(allowed);
  getClientIp.mockResolvedValue("203.0.113.1");
  createClient.mockResolvedValue({ auth: { signInWithPassword: signIn } });
  signIn.mockResolvedValue({ error: null });
});

describe("loginAction rate limits", () => {
  it.each([[false, true], [true, false], [false, false]])("blocks IP allowed=%s account allowed=%s", async (ipAllowed, accountAllowed) => {
    const resetAt = Date.now() + 900_000;
    ipCheck.mockResolvedValue({ success: ipAllowed, remaining: 0, resetAt });
    accountCheck.mockResolvedValue({ success: accountAllowed, remaining: 0, resetAt });
    expect(await loginAction("9900001", "password")).toEqual({
      error: "ログイン試行回数の上限に達しました。15分後に再試行してください。",
    });
    expect(ipCheck).toHaveBeenCalledWith("203.0.113.1");
    expect(accountCheck).toHaveBeenCalledWith("9900001");
    expect(createClient).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("authenticates when both buckets allow the normalized account", async () => {
    expect(await loginAction(" 9900001 ", "password")).toEqual({ success: true });
    expect(accountCheck).toHaveBeenCalledWith("9900001");
    expect(signIn).toHaveBeenCalledWith({ email: "9900001@ed.tus.ac.jp", password: "password" });
  });

  it("preserves the generic authentication error", async () => {
    signIn.mockResolvedValue({ error: { message: "Invalid credentials" } });
    expect(await loginAction("9900001", "wrong")).toEqual({ error: "学籍番号またはパスワードが正しくありません" });
  });

  it.each([["123", "password"], ["9900001", ""]])("validates input before counting attempts", async (studentNumber, password) => {
    expect(await loginAction(studentNumber, password)).toHaveProperty("error");
    expect(ipCheck).not.toHaveBeenCalled();
    expect(accountCheck).not.toHaveBeenCalled();
  });
});
