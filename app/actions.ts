"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/server";
import { z } from "zod";
import { formSchema } from "@/lib/schema";
import { logAuditEvent } from "@/lib/audit-log";
import { uploadRateLimiter } from "@/lib/rate-limit";
import {
  updateTransactionStatusSchema,
  deleteTransactionSchema,
} from "@/lib/validations";
import { resolveAuthContext } from "@/lib/auth/context";
import { getUserRoleAccess } from "@/lib/roles/access";
import { ROLE_TYPES } from "@/lib/roles/constants";

export async function signOut() {
  const authResult = await resolveAuthContext();
  if (authResult.ok) {
    await authResult.context.supabase.auth.signOut();
  }
  redirect("/login");
}

export async function uploadReceiptAction(formData: FormData) {
  // Authentication check
  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;

  // Rate limiting: 10 uploads per hour per user
  const rateLimitResult = uploadRateLimiter.check(auth.userId);
  if (!rateLimitResult.success) {
    const retryMinutes = Math.ceil(
      (rateLimitResult.resetAt - Date.now()) / 1000 / 60,
    );
    return {
      error: `アップロード回数の上限に達しました。${retryMinutes}分後に再試行してください。`,
    };
  }

  const file = formData.get("file") as File;
  const fileName = formData.get("fileName") as string;

  if (!file || !fileName) {
    return { error: "ファイルとファイル名は必須です" };
  }

  // File type validation
  const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"];
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return { error: "許可されていないファイル形式です（JPEG, PNG, PDFのみ）" };
  }

  // File size validation (max 10MB)
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    return { error: "ファイルサイズが大きすぎます（最大10MB）" };
  }

  // Sanitize filename to prevent directory traversal
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9\-._]/g, "_");

  // createAdminClient is required here to bypass storage RLS for receipt uploads
  const supabaseAdmin = createAdminClient();

  // upsert configuration is used in case a user updates the receipt for the same transaction
  const { error } = await supabaseAdmin.storage
    .from("receipts")
    .upload(sanitizedFileName, file, { upsert: true });

  if (error) {
    console.error("[uploadReceiptAction] Storage upload error:", error);
    return { error: "アップロードに失敗しました" };
  }

  return { success: true, filePath: sanitizedFileName };
}

export async function updateTransactionStatus(
  transactionId: string,
  status: "approved" | "rejected",
  reason?: string,
) {
  // Validate inputs
  const validation = updateTransactionStatusSchema.safeParse({
    transactionId,
    status,
    reason,
  });
  if (!validation.success) {
    return { error: "入力データが不正です" };
  }

  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;

  const { data: transaction, error: txFetchError } = await auth.supabase
    .from("transactions")
    .select(
      "accounting_group_id, created_by, approval_status, approved_by, approved_at, rejected_reason",
    )
    .eq("id", transactionId)
    .single();

  if (txFetchError || !transaction) {
    console.error("[updateTransactionStatus] Fetch error:", txFetchError);
    return { error: "対象のデータが見つかりません" };
  }

  const access = await getUserRoleAccess(auth);
  const isGlobalAdmin = access.isAdmin;
  const isGroupLeader = access.roles.some(
    (r) =>
      r.type === ROLE_TYPES.LEADER &&
      r.accountingGroupId === transaction.accounting_group_id,
  );

  if (!isGlobalAdmin && !isGroupLeader) {
    return { error: "承認権限がありません" };
  }

  if (transaction.created_by === auth.profileId) {
    return { error: "自分の申請を承認することはできません" };
  }

  const newStatusData = {
    approval_status: status,
    approved_by: auth.profileId,
    approved_at: new Date().toISOString(),
    rejected_reason: reason || null,
  };

  const { error: updateError } = await auth.supabase
    .from("transactions")
    .update(newStatusData)
    .eq("id", transactionId);

  if (updateError) {
    console.error("[updateTransactionStatus] Update error:", updateError);
    return { error: "ステータス更新に失敗しました" };
  }

  await logAuditEvent({
    tableName: "transactions",
    recordId: transactionId,
    action: "UPDATE",
    oldData: {
      approval_status: transaction.approval_status,
      approved_by: transaction.approved_by,
      approved_at: transaction.approved_at,
      rejected_reason: transaction.rejected_reason,
    },
    newData: newStatusData,
    changedBy: auth.profileId,
  });

  revalidatePath("/ledger");
  return { success: true };
}

export async function updateTransaction(
  id: string,
  values: z.infer<typeof formSchema> & { receipt_url?: string | null },
) {
  // Validate id
  const idValidation = z.string().uuid().safeParse(id);
  if (!idValidation.success) {
    return { error: "入力データが不正です" };
  }

  // Runtime validation of form values
  const valuesValidation = formSchema.safeParse(values);
  if (!valuesValidation.success) {
    return { error: "入力データが不正です" };
  }

  // Validate receipt_url: must be a relative storage path (no external URLs, no path traversal)
  if (values.receipt_url != null) {
    const isValidPath =
      /^[a-zA-Z0-9\-._/]+$/.test(values.receipt_url) &&
      !values.receipt_url.includes("..");
    if (!isValidPath) {
      return { error: "領収書URLの形式が不正です" };
    }
  }

  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;

  const { data: transaction, error: txFetchError } = await auth.supabase
    .from("transactions")
    .select("accounting_group_id, created_by, approval_status, amount")
    .eq("id", id)
    .single();

  if (txFetchError || !transaction) {
    console.error("[updateTransaction] Fetch error:", txFetchError);
    return { error: "対象のデータが見つかりません" };
  }

  const access = await getUserRoleAccess(auth);
  const isGlobalAdmin = access.isAdmin;
  const isAccountingUser = access.hasAccountingRole;
  const isGroupLeader = access.roles.some(
    (r) =>
      r.type === ROLE_TYPES.LEADER &&
      r.accountingGroupId === transaction.accounting_group_id,
  );

  const canEdit =
    transaction.created_by === auth.profileId ||
    isGlobalAdmin ||
    isAccountingUser ||
    isGroupLeader;

  if (!canEdit) {
    return { error: "更新できませんでした（権限がない可能性があります）" };
  }

  const isGeneralUserOnly =
    !isGlobalAdmin && !isAccountingUser && !isGroupLeader;
  if (isGeneralUserOnly && transaction.approval_status !== "pending") {
    return { error: "受付中以外のデータは編集できません" };
  }

  const { data: fy } = await auth.supabase
    .from("fiscal_years")
    .select("year")
    .eq("is_current", true)
    .single();

  const effectiveType = values.type;
  const finalAmount =
    effectiveType === "expense"
      ? -Math.abs(values.amount)
      : Math.abs(values.amount);

  const dateObj = new Date(values.date);
  const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;

  const updates: Record<string, unknown> = {
    amount: finalAmount,
    description: values.description,
    fiscal_year_id: fy?.year ?? null,
    date: dateStr,
    accounting_group_id: values.accounting_group_id,
  };

  if (values.receipt_url !== undefined) {
    updates.receipt_url = values.receipt_url;
  }

  if (values.remarks !== undefined) {
    updates.remarks = values.remarks;
  }

  if (values.created_by !== undefined && isGlobalAdmin) {
    updates.created_by = values.created_by;
  }

  if (values.approved_by !== undefined && isGlobalAdmin) {
    updates.approved_by =
      values.approved_by === "clear" ? null : values.approved_by;
  }

  if (
    values.approval_status !== undefined &&
    (isGlobalAdmin || isAccountingUser)
  ) {
    updates.approval_status = values.approval_status;
  }

  const { error: updateError } = await auth.supabase
    .from("transactions")
    .update(updates)
    .eq("id", id);

  if (updateError) {
    console.error("[updateTransaction] Update error:", updateError);
    return { error: "更新に失敗しました。しばらくしてから再試行してください。" };
  }

  await logAuditEvent({
    tableName: "transactions",
    recordId: id,
    action: "UPDATE",
    oldData: {
      amount: transaction.amount,
      approval_status: transaction.approval_status,
    },
    newData: updates,
    changedBy: auth.profileId,
  });

  revalidatePath("/ledger");
  revalidatePath("/applications");
  return { success: true };
}

export async function deleteTransaction(id: string) {
  // Validate id
  const validation = deleteTransactionSchema.safeParse({ id });
  if (!validation.success) {
    return { error: "入力データが不正です" };
  }

  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;

  const { data: transaction, error: txFetchError } = await auth.supabase
    .from("transactions")
    .select(
      "created_by, approval_status, amount, description, accounting_group_id",
    )
    .eq("id", id)
    .single();

  if (txFetchError || !transaction) {
    console.error("[deleteTransaction] Fetch error:", txFetchError);
    return { error: "対象のデータが見つかりません" };
  }

  const access = await getUserRoleAccess(auth);
  const isAdmin = access.isAdmin;
  const isOwner = transaction.created_by === auth.profileId;

  if (!isAdmin && !(isOwner && transaction.approval_status === "pending")) {
    return { error: "削除する権限がありません。" };
  }

  const { error: deleteError } = await auth.supabase
    .from("transactions")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("[deleteTransaction] Delete error:", deleteError);
    return { error: "削除に失敗しました。しばらくしてから再試行してください。" };
  }

  await logAuditEvent({
    tableName: "transactions",
    recordId: id,
    action: "DELETE",
    oldData: {
      created_by: transaction.created_by,
      approval_status: transaction.approval_status,
      amount: transaction.amount,
      description: transaction.description,
      accounting_group_id: transaction.accounting_group_id,
    },
    changedBy: auth.profileId,
  });

  revalidatePath("/ledger");
  revalidatePath("/applications");
  return { success: true };
}
