/**
 * 領収書の署名付き URL 発行 (サーバー専用)。
 *
 * receipts バケットは private で、ログインユーザー向けの Storage ポリシーも
 * 置いていない。閲覧は必ず app/api/receipts/route.ts を通し、ログイン確認の
 * 「後」にここで service-role クライアントを使って短命の URL を発行する。
 * バケット名と有効期限はここで固定し、呼び出し側から変えられないようにする。
 */

import "server-only";

import { createAdminClient } from "@/utils/supabase/server";
import { isSafeReceiptObjectPath } from "@/lib/receipt-url";

const RECEIPTS_BUCKET = "receipts";

/**
 * Lifetime of a signed receipt URL. The route redirects immediately, so this
 * only needs to cover the browser fetch (and PDF viewer range requests).
 */
export const RECEIPT_SIGNED_URL_TTL_SECONDS = 300;

export type ReceiptSignedUrlResult =
  | { ok: true; signedUrl: string }
  | { ok: false; reason: "invalid_path" | "not_found" | "error" };

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { status, statusCode } = error as {
    status?: unknown;
    statusCode?: unknown;
  };
  return status === 404 || statusCode === "404";
}

/**
 * Create a short-lived signed URL for an object in the receipts bucket.
 *
 * The caller MUST have authenticated the user first: this function uses the
 * service role and performs no authorization of its own.
 */
export async function createReceiptSignedUrl(
  path: string,
): Promise<ReceiptSignedUrlResult> {
  if (!isSafeReceiptObjectPath(path)) {
    return { ok: false, reason: "invalid_path" };
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrl(path, RECEIPT_SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      if (isNotFoundError(error)) return { ok: false, reason: "not_found" };
      console.error("[createReceiptSignedUrl] Signing failed:", error);
      return { ok: false, reason: "error" };
    }
    return { ok: true, signedUrl: data.signedUrl };
  } catch (error) {
    console.error("[createReceiptSignedUrl] Unexpected error:", error);
    return { ok: false, reason: "error" };
  }
}
