"use server";

import { logAuditEvent } from "@/lib/audit-log";
import { getAccountingUserIdSync } from "@/lib/system-config";
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

  // Role validation: Accounting or Admin only
  if (!canManageSubsidies(access)) {
    return {
      error: "このページにアクセスする権限がありません",
      data: [],
      isAdmin: false,
    };
  }

  // Fetch all subsidies including applicant name and transactions
  // Uses createClient() with RLS - role-based access is enforced by RLS policies
  let subsidyQuery = auth.supabase
    .from("subsidy_items")
    .select(
      "id,category,term,expense_type,name,applicant_id,accounting_group_id,requested_amount,approved_amount,actual_amount,status,created_at,receipt_date,receipt_url,evidence_url,remarks,justification,usage_period,profiles!subsidy_items_applicant_id_fkey(name),accounting_groups!subsidy_items_accounting_group_id_fkey(name)",
    )
    .is("deleted_at", null);

  if (typeof year === "number" && Number.isFinite(year)) {
    subsidyQuery = subsidyQuery.eq("fiscal_year_id", year);
  } else if (typeof year !== "undefined") {
    return { error: "無効な年度が指定されました", data: [] };
  }

  const { data, error } = await subsidyQuery.order("created_at", {
    ascending: false,
  });

  if (error) {
    console.error("Fetch all subsidies error:", JSON.stringify(error, null, 2));
    return { error: "支援金申請データの取得に失敗しました", data: [] };
  }

  // Process data to calculate actual amounts
  type SubsidyRow = {
    id: string;
    category: string;
    term: number;
    expense_type: string;
    name: string;
    applicant_id: string;
    accounting_group_id: string;
    requested_amount: number;
    approved_amount: number | null;
    actual_amount: number | null;
    status: string;
    created_at: string;
    receipt_date: string | null;
    receipt_url: string | null;
    evidence_url: string | null;
    remarks: string | null;
    justification: string | null;
    usage_period: string | null;
    profiles?: { name?: string | null } | null;
    accounting_groups?: { name?: string | null } | null;
  };

  const accountingUserId = getAccountingUserIdSync();
  const processedData = (data as unknown as SubsidyRow[]).map((item) => {
    return {
      id: item.id,
      category: item.category,
      term: item.term,
      expense_type: item.expense_type,
      accounting_group_id: item.accounting_group_id,
      accounting_group_name: item.accounting_groups?.name || "-",
      name: item.name,
      applicant_id: item.applicant_id,
      requested_amount: item.requested_amount,
      calculated_amount: item.approved_amount || 0, // Using approved_amount as "算定額"
      actual_expense: item.actual_amount || 0,
      status: item.status,
      remarks: item.remarks || "",
      justification: item.justification || null,
      usage_period: item.usage_period || null,
      created_at: item.created_at,
      receipt_date: item.receipt_date,
      receipt_url: item.receipt_url,
      evidence_url: item.evidence_url,
      applicant_name:
        item.applicant_id === accountingUserId
          ? "会計"
          : item.profiles?.name || "不明",
    };
  });

  return { success: true, data: processedData, isAdmin: isAdmin(access) };
}

export async function fetchProfilesList() {
  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error, data: [] };
  const auth = authResult.context;

  const { data, error } = await auth.supabase
    .from("profiles")
    .select("id, name")
    .is("deleted_at", null)
    .order("name");

  if (error) {
    console.error("fetchProfilesList error:", JSON.stringify(error, null, 2));
    return { error: "ユーザー一覧の取得に失敗しました", data: [] };
  }

  return { success: true, data };
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

  // Only admins can soft-delete subsidy items due to RLS policy constraints
  // The subsidy_items_update_admin_accounting policy has WITH CHECK (deleted_at IS NULL)
  // which prevents setting deleted_at to non-null, so soft deletes must be restricted to admins
  if (!canSoftDeleteSubsidyItems(access)) {
    return { error: "権限がありません" };
  }

  // Soft delete instead of physical delete
  // Uses createClient() with RLS - authorization is enforced by RLS policies
  const deletedAt = new Date().toISOString();
  const { data: deletedRows, error } = await auth.supabase
    .from("subsidy_items")
    .update({ deleted_at: deletedAt })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error("deleteSubsidyItem error:", JSON.stringify(error, null, 2));
    return { error: "申請の削除に失敗しました" };
  }
  if (!deletedRows || deletedRows.length !== 1) {
    return { error: SUBSIDY_NOT_UPDATED_ERROR };
  }

  await logAuditEvent({
    tableName: "subsidy_items",
    recordId: id,
    action: "SOFT_DELETE",
    newData: { deleted_at: deletedAt },
    changedBy: auth.profileId,
  });

  revalidatePath("/subsidies");
  revalidatePath("/subsidies/manage");
  revalidatePath("/");
  return { success: true };
}
