import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientIp } from "@/lib/client-ip";

const { mockHeaders } = vi.hoisted(() => ({ mockHeaders: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mockHeaders }));
afterEach(() => vi.unstubAllEnvs());

describe("getClientIp", () => {
  it.each([
    ["1", "198.51.100.1", "203.0.113.1, 203.0.113.2", "198.51.100.1"],
    ["1", null, " 203.0.113.1 , 203.0.113.2", "203.0.113.1"],
    ["1", null, null, "unknown"],
    ["0", "198.51.100.1", " 203.0.113.1 , 203.0.113.2", "203.0.113.1"],
    ["0", "198.51.100.1", null, "198.51.100.1"],
    ["0", null, null, "unknown"],
    ["0", " 198.51.100.1 ", " , 203.0.113.2", "198.51.100.1"],
    ["1", "   ", "203.0.113.1", "203.0.113.1"],
  ])("resolves VERCEL=%s real=%s forwarded=%s", async (vercel, real, forwarded, expected) => {
    vi.stubEnv("VERCEL", vercel);
    const headers = new Headers();
    if (real !== null) headers.set("x-real-ip", real);
    if (forwarded !== null) headers.set("x-forwarded-for", forwarded);
    mockHeaders.mockResolvedValue(headers);
    expect(await getClientIp()).toBe(expected);
  });
});
