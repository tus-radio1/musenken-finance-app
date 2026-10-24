import { headers } from "next/headers";

export async function getClientIp(): Promise<string> {
  const requestHeaders = await headers();
  const realIp = requestHeaders.get("x-real-ip")?.trim();
  const forwardedIp = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();

  // Vercel overwrites these headers at its edge to prevent IP spoofing.
  // Self-hosted deployments must configure a trusted proxy to do the same.
  if (process.env.VERCEL === "1") {
    return realIp || forwardedIp || "unknown";
  }
  return forwardedIp || realIp || "unknown";
}
