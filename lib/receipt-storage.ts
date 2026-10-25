/** Server-only cleanup. Deleted records' files remain evidence. */
import { createAdminClient } from "@/utils/supabase/server";
import { isReceiptPathOwnedBy } from "@/lib/receipt-upload";
import { auditReceiptNames, receiptObjectName } from "@/lib/receipt-object-name.mjs";

const PAGE_SIZE = 500;
type AdminClient = ReturnType<typeof createAdminClient>;

/** Service-role reads include soft-deleted rows and legacy full URLs. Fail closed. */
async function isReceiptStillReferenced(admin: AdminClient, path: string): Promise<boolean> {
  for (const table of ["transactions", "subsidy_items"] as const) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await admin.from(table)
        .select(table === "transactions" ? "id, receipt_url" : "id, receipt_url, evidence_url")
        .order("id").range(offset, offset + PAGE_SIZE - 1);
      if (error || !data) {
        console.error("[receipt cleanup] Reference check failed:", error);
        return true;
      }
      if (data.some((row) => auditReceiptNames(row).includes(path))) return true;
      if (data.length < PAGE_SIZE) break;
    }
  }
  // Hard-deleted rows are absent above. Preserve their evidence even if the
  // caller knows an old path. UPDATE audit references alone allow replacement.
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin.from("audit_logs")
      .select("id, old_data, new_data").in("action", ["DELETE", "SOFT_DELETE"])
      .order("id").range(offset, offset + PAGE_SIZE - 1);
    if (error || !data) {
      console.error("[receipt cleanup] Audit check failed:", error);
      return true;
    }
    if (data.some((row) => auditReceiptNames(row).includes(path))) return true;
    if (data.length < PAGE_SIZE) break;
  }
  return false;
}

/** Only a caller-owned, unreferenced upload can be removed. Never throws. */
export async function removeUnreferencedReceipt(path: string, actorUserId: string): Promise<boolean> {
  if (!actorUserId || !isReceiptPathOwnedBy(path, actorUserId)) return false;
  try {
    const admin = createAdminClient();
    if (await isReceiptStillReferenced(admin, path)) return false;
    const { data: claimed, error: claimError } = await admin.rpc("claim_receipt_cleanup", {
      p_path: path, p_owner_id: actorUserId,
    });
    if (claimError || claimed !== true) {
      if (claimError) console.error("[receipt cleanup] Claim failed:", claimError);
      return false;
    }
    const { error } = await admin.storage.from("receipts").remove([path]);
    if (error) {
      console.error("[receipt cleanup] Storage removal failed:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[receipt cleanup] Unexpected error:", error);
    return false;
  }
}

export type RemoveReplacedReceiptParams = {
  oldPath: string | null | undefined;
  newPath: string | null | undefined;
  actorUserId: string;
};

/** Call after a successful replacement, with the old value read from the DB. */
export async function removeReplacedReceipt({ oldPath, newPath, actorUserId }: RemoveReplacedReceiptParams): Promise<void> {
  const path = receiptObjectName(oldPath);
  if (!path || path === receiptObjectName(newPath)) return;
  await removeUnreferencedReceipt(path, actorUserId);
}
