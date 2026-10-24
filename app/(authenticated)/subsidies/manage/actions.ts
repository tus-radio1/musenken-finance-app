"use server";

import { logAuditEvent } from "@/lib/audit-log";
import { readAllSubsidies, readProfilesList } from "@/lib/subsidies-data";
import {
  updateSubsidyStatusSchema,
  updateSubsidyItemSchema,
  deleteSubsidyItemSchema,
  validateInput,
} from "@/lib/validations";
import { revalidatePath } from "next/cache";
import { resolveAuthContext, resolveAuthWithRoles } from "@/lib/auth/context";
import {
  canManageSubsidies,
  canSoftDeleteSubsidyItems,
  isAdmin,
} from "@/lib/roles/permissions";
import {
  RECEIPT_PATH_ERROR_MESSAGE,
  checkReceiptPathUpdates,
} from "@/lib/receipt-upload";
import { removeReplacedReceipt } from "@/lib/receipt-storage";

export async function fetchAllSubsidies(year?: number) {
  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error, data: [] };
  const auth = authResult.context;
  const access = authResult.access;

  return readAllSubsidies(auth, access, year);
}

export async function fetchProfilesList() {
  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error, data: [] };
  return readProfilesList(authResult.context);
}

const SUBSIDY_NOT_UPDATED_ERROR =
  "対象の申請を更新できませんでした。再読み込みしてください";

export async function updateSubsidyStatus(id: string, status: string) {
  const inputValidation = validateInput(updateSubsidyStatusSchema, {
    id,
    status,
  });
  if (!inputValidation.success) {
    return { error: "入力データが不正です" };
  }
  const validatedStatus = inputValidation.data.status;

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;
  const access = authResult.access;

  if (!canManageSubsidies(access)) {
    return { error: "権限がありません" };
  }

  // "unexecuted" also deletes the linked transactions. Count them first: only
  // admins (and owners of pending rows) may delete transactions under RLS, so
  // a non-admin with linked rows is stopped before anything is written.
  // Making the two writes atomic is R6.
  const isUnexecuted = validatedStatus === "unexecuted";
  let linkedCount = 0;
  if (isUnexecuted) {
    const { count, error: countError } = await auth.supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("subsidy_item_id", id);
    if (countError || count === null) {
      console.error("updateSubsidyStatus linked count error:", countError);
      return { error: "関連する出納帳データの確認に失敗しました" };
    }
    linkedCount = count;
    if (linkedCount > 0 && !isAdmin(access)) {
      return {
        error: "出納帳に関連データがあるため、管理者に操作を依頼してください",
      };
    }
  }

  // Uses createClient() with RLS - authorization is enforced by RLS policies
  const { data: updatedRows, error } = await auth.supabase
    .from("subsidy_items")
    .update({ status: validatedStatus })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error("updateSubsidyStatus error:", JSON.stringify(error, null, 2));
    return { error: "ステータスの更新に失敗しました" };
  }
  if (!updatedRows || updatedRows.length !== 1) {
    return { error: SUBSIDY_NOT_UPDATED_ERROR };
  }

  await logAuditEvent({
    tableName: "subsidy_items",
    recordId: id,
    action: "UPDATE",
    newData: { status: validatedStatus },
    changedBy: auth.profileId,
  });

  if (isUnexecuted && linkedCount > 0) {
    // Physical delete related transactions
    const { data: relatedTx, error: txError } = await auth.supabase
      .from("transactions")
      .delete()
      .eq("subsidy_item_id", id)
      .select("id");

    if (txError) {
      console.error("Failed to delete related transactions:", txError);
      return { error: "関連する出納帳データの削除に失敗しました" };
    }

    // Log audit events for all deleted transactions in parallel
    await Promise.all(
      (relatedTx ?? []).map((tx) =>
        logAuditEvent({
          tableName: "transactions",
          recordId: tx.id,
          action: "DELETE",
          oldData: { subsidy_item_id: id },
          changedBy: auth.profileId,
        }),
      ),
    );

    if ((relatedTx?.length ?? 0) < linkedCount) {
      console.error(
        "updateSubsidyStatus: linked transactions only partly deleted",
        { expected: linkedCount, deleted: relatedTx?.length ?? 0 },
      );
      return {
        error:
          "ステータスは更新しましたが、関連する出納帳データの一部を削除できませんでした",
      };
    }
  }

  revalidatePath("/subsidies");
  revalidatePath("/subsidies/manage");
  revalidatePath("/");
  return { success: true };
}

export async function updateSubsidyItem(
  id: string,
  updates: {
    category?: string;
    term?: number;
    expense_type?: string;
    accounting_group_id?: string;
    name?: string;
    applicant_id?: string;
    requested_amount?: number;
    approved_amount?: number;
    actual_amount?: number;
    created_at?: string;
    receipt_date?: string | null;
    receipt_url?: string | null;
    remarks?: string;
    usage_period?: string | null;
    justification?: string | null;
    evidence_url?: string | null;
  },
) {
  const inputValidation = validateInput(updateSubsidyItemSchema, {
    id,
    updates,
  });
  if (!inputValidation.success) {
    return { error: "入力データが不正です" };
  }
  // Only schema-validated fields are written; unknown keys (status,
  // fiscal_year_id, deleted_at, ...) are stripped by the schema.
  const validatedUpdates = inputValidation.data.updates;

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;
  const access = authResult.access;

  if (!canManageSubsidies(access)) {
    return { error: "権限がありません" };
  }

  // Current file paths, read from the DB for the ownership rule and cleanup.
  const { data: item, error: fetchError } = await auth.supabase
    .from("subsidy_items")
    .select("receipt_url, evidence_url")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !item) {
    return { error: "支援金申請情報の取得に失敗しました" };
  }

  // A replaced receipt / evidence path must be an object the editor uploaded
  // (admins and accounting staff upload into their own storage prefix).
  const receiptCheck = checkReceiptPathUpdates(validatedUpdates, item, auth.userId);
  if (!receiptCheck.ok) {
    return { error: RECEIPT_PATH_ERROR_MESSAGE };
  }
  const updatesToWrite = { ...validatedUpdates, ...receiptCheck.normalized };

  // Uses createClient() with RLS - authorization is enforced by RLS policies
  const { data: updatedRows, error } = await auth.supabase
    .from("subsidy_items")
    .update(updatesToWrite)
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error("updateSubsidyItem error:", JSON.stringify(error, null, 2));
    return { error: "申請情報の更新に失敗しました" };
  }
  if (!updatedRows || updatedRows.length !== 1) {
    return { error: SUBSIDY_NOT_UPDATED_ERROR };
  }

  // Remove replaced files only after the update succeeded. The helper only
  // deletes objects in the editor's own prefix, so an applicant's file that an
  // admin replaced is intentionally left as an orphan.
  for (const column of receiptCheck.changed) {
    await removeReplacedReceipt({
      oldPath: item[column],
      newPath: receiptCheck.normalized[column],
      actorUserId: auth.userId,
    });
  }

  await logAuditEvent({
    tableName: "subsidy_items",
    recordId: id,
    action: "UPDATE",
    newData: updatesToWrite as Record<string, unknown>,
    changedBy: auth.profileId,
  });

  revalidatePath("/subsidies");
  revalidatePath("/subsidies/manage");
  revalidatePath("/");
  return { success: true };
}

export async function deleteSubsidyItem(id: string) {
  const inputValidation = validateInput(deleteSubsidyItemSchema, { id });
  if (!inputValidation.success) {
    return { error: "入力データが不正です" };
  }

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;
  const access = authResult.access;

  // Admins and accounting can soft-delete through the narrow RPC.
  if (!canSoftDeleteSubsidyItems(access)) {
    return { error: "権限がありません" };
  }

  // The RPC only sets deleted_at after checking admin/accounting by name.
  // It returns the affected ID without granting SELECT on deleted items.
  const { data: deletedId, error } = await auth.supabase.rpc(
    "soft_delete_subsidy_item",
    { p_id: id },
  );

  if (error) {
    console.error("deleteSubsidyItem error:", JSON.stringify(error, null, 2));
    return { error: "申請の削除に失敗しました" };
  }
  if (deletedId !== id) {
    return { error: SUBSIDY_NOT_UPDATED_ERROR };
  }

  await logAuditEvent({
    tableName: "subsidy_items",
    recordId: id,
    action: "SOFT_DELETE",
    newData: { deleted_at: new Date().toISOString() },
    changedBy: auth.profileId,
  });

  revalidatePath("/subsidies");
  revalidatePath("/subsidies/manage");
  revalidatePath("/");
  return { success: true };
}
