/**
 * 領収書・根拠書類の閲覧ルート。
 *
 * GET /api/receipts?path=<object path>
 *   - 未ログイン: 401 (署名 URL は発行しない)
 *   - パス不正: 400 / ファイルなし: 404 / 発行失敗: 502
 *   - 成功: 短命の署名付き URL へ 302 リダイレクト
 *
 * `/api` は proxy.ts の公開パスなので、ここで必ず認証を確認する。
 * 閲覧範囲はログイン済みの部員全員 (transactions / subsidy_items の行の
 * 可視範囲と同じ)。所有者・班単位の制限はデータ側の RLS と合わせて後で入れる。
 */

import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthContext } from "@/lib/auth/context";
import { createReceiptSignedUrl } from "@/lib/receipt-signing";
import {
  RECEIPT_VIEW_PATH_PARAM,
  isSafeReceiptObjectPath,
} from "@/lib/receipt-url";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
} as const;

function errorResponse(message: string, status: number): NextResponse {
  return new NextResponse(message, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await resolveAuthContext();
  if (!authResult.ok) {
    return errorResponse("認証が必要です", 401);
  }

  const path = request.nextUrl.searchParams.get(RECEIPT_VIEW_PATH_PARAM);
  if (!path || !isSafeReceiptObjectPath(path)) {
    return errorResponse("ファイルの指定が不正です", 400);
  }

  const result = await createReceiptSignedUrl(path);
  if (!result.ok) {
    if (result.reason === "invalid_path") {
      return errorResponse("ファイルの指定が不正です", 400);
    }
    if (result.reason === "not_found") {
      return errorResponse("ファイルが見つかりません", 404);
    }
    return errorResponse("ファイルを開けませんでした", 502);
  }

  return NextResponse.redirect(result.signedUrl, {
    status: 302,
    headers: NO_STORE_HEADERS,
  });
}
