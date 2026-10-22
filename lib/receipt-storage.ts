/**
 * 領収書ストレージの後片付け (サーバー専用)。
 *
 * 記録 (transactions / subsidy_items) の receipt_url / evidence_url を
 * 差し替えた「後」に、旧ファイルをベストエフォートで削除する。
 * 旧パスは必ず DB から読んだ値を渡すこと (クライアント入力を渡してはならない)。
 *
 * 削除できるのは、操作者自身の名前空間 (`<actorUserId>/...`) にあり、
 * かつどの行からも参照されていないファイルだけ。テーブルの RLS は
 * 本人が receipt_url に任意のパスを直接書き込むことを許すため、
 * DB の値だけを削除の根拠にしてはならない。旧形式 (接頭辞なし) や
 * 他ユーザーのファイルは削除せず残す (孤児ファイルは許容する)。
 *
 * `@/utils/supabase/server` が "server-only" を import しているため、
 * このモジュールはクライアントバンドルに含められない。
 */

import { createAdminClient } from "@/utils/supabase/server";
import { isReceiptPathOwnedBy } from "@/lib/receipt-upload";

const RECEIPTS_BUCKET = "receipts";

/** Columns that may hold a path in the receipts bucket. */
const RECEIPT_REFERENCE_COLUMNS = [
  { table: "transactions", column: "receipt_url" },
  { table: "subsidy_items", column: "receipt_url" },
  { table: "subsidy_items", column: "evidence_url" },
] as const;

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * True when at least one row (soft-deleted rows included) still references
 * the path, or when the check itself failed (fail closed: keep the file).
 */
async function isReceiptStillReferenced(
  admin: AdminClient,
  path: string,
): Promise<boolean> {
  for (const { table, column } of RECEIPT_REFERENCE_COLUMNS) {
    const { count, error } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(column, path);
    if (error || count === null || count > 0) {
      if (error) {
        console.error("[removeReplacedReceipt] Reference check failed:", error);
      }
      return true;
    }
  }
  return false;
}

export type RemoveReplacedReceiptParams = {
  /** Path stored on the record before the update (read from the DB). */
  oldPath: string | null | undefined;
  /** Path stored on the record after the update. */
  newPath: string | null | undefined;
  /** Authenticated user performing the update (auth.userId). */
  actorUserId: string;
};

/**
 * Remove a receipt object that a record no longer points to.
 *
 * Call only after the owning record update has succeeded. Deletes only when
 * the old path is inside the actor's own storage prefix and no row
 * references it any more. Never throws: failures are logged and leave an
 * orphaned object rather than a record pointing to a missing file.
 */
export async function removeReplacedReceipt({
  oldPath,
  newPath,
  actorUserId,
}: RemoveReplacedReceiptParams): Promise<void> {
  if (!oldPath || oldPath === newPath) return;
  if (!actorUserId || !isReceiptPathOwnedBy(oldPath, actorUserId)) return;

  try {
    const admin = createAdminClient();
    if (await isReceiptStillReferenced(admin, oldPath)) return;

    const { error } = await admin.storage
      .from(RECEIPTS_BUCKET)
      .remove([oldPath]);
    if (error) {
      console.error("[removeReplacedReceipt] Failed to remove file:", error);
    }
  } catch (error) {
    console.error("[removeReplacedReceipt] Unexpected error:", error);
  }
}
