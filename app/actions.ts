"use server";

/**
 * 取引関連の Server Actions。
 *
 * 権限モデル（判定は lib/roles/permissions.ts）:
 *   - createTransaction: ログイン済みユーザー（approval_status は常に "pending" で開始）
 *   - updateTransactionStatus: 管理者・会計。自分の申請は誰も承認できない
 *     （管理者を含む）。過年度の取引は管理者のみ
 *   - updateTransaction: 管理者・会計、または pending の自分の取引（班長は不可）
 *   - deleteTransaction: 管理者は無条件、作成者は pending のみ削除可
 *
 * 承認フロー (approval_status) の許可遷移:
 *   pending → approved | rejected   (updateTransactionStatus — 管理者・会計)
 *   管理者・会計は updateTransaction で承認ステータスを直接変更できる。
 *   会計は自分の取引と過年度の取引を変更できない。管理者が自分の取引を
 *   変更するのは break-glass の修正で、監査ログを先に記録できた場合のみ行う。
 *   ※ 将来仕様で transaction_kind = "transfer" が追加された場合、
 *     ペアとなる2行を同時に承認する追加ロジックが必要になる
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/server";
import { z } from "zod";
import { formSchema } from "@/lib/schema";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import { logAuditEvent, recordAuditEvent } from "@/lib/audit-log";
import { uploadRateLimiter } from "@/lib/rate-limit";
import { formatDateForDatabase } from "@/lib/date";
import {
  ACCOUNTING_USER_ID_FALLBACK,
  getAccountingUserId,
} from "@/lib/system-config";
import {
  updateTransactionStatusSchema,
  updateTransactionReferencesSchema,
  deleteTransactionSchema,
} from "@/lib/validations";
import { resolveAuthContext, resolveAuthWithRoles } from "@/lib/auth/context";
import type { SupabaseServerClient } from "@/lib/auth/types";
import type { RoleAccessContext } from "@/lib/roles/types";
import {
  canDeleteTransaction,
  canEditTransaction,
  canFileTransactionInGroup,
  canReassignTransactionPeople,
  canSetApprovalFieldsDirectly,
  checkTransactionApproval,
  isAdmin,
  isAdminOrAccounting,
  isClubGroup,
  type ApprovalDenialReason,
} from "@/lib/roles/permissions";
import {
  ADMIN_SELF_ROW_CORRECTION,
  approvalFieldsForDecision,
  approvalFieldsForStatusChange,
  type ApprovalFields,
} from "@/lib/transaction-approval";
import {
  RECEIPT_MIME_EXTENSIONS,
  isAllowedReceiptMimeType,
  isReceiptPathOwnedBy,
  validateReceiptFile,
} from "@/lib/receipt-upload";
import { removeReplacedReceipt } from "@/lib/receipt-storage";

const RECEIPT_PATH_ERROR = "領収書URLの形式が不正です";

function normalizeAccountingUserId(
  userId: string | null | undefined,
  accountingUserId: string,
): string | null | undefined {
  if (typeof userId === "undefined") {
    return undefined;
  }

  if (userId === null) {
    return null;
  }

  if (
    userId === accountingUserId ||
    userId === ACCOUNTING_USER_ID_FALLBACK
  ) {
    return accountingUserId;
  }

  return userId;
}

/**
 * Whether the caller may file a transaction into the group. A missing group
 * or a lookup error denies.
 */
async function checkFilingGroup(
  supabase: SupabaseServerClient,
  access: RoleAccessContext,
  accountingGroupId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: group, error } = await supabase
    .from("accounting_groups")
    .select("id, type")
    .eq("id", accountingGroupId)
    .maybeSingle();

  if (error) {
    console.error("[checkFilingGroup] Group fetch error:", error);
    return { ok: false, error: "会計グループの取得に失敗しました" };
  }
  if (!group) {
    return { ok: false, error: "会計グループが見つかりません" };
  }
  if (canFileTransactionInGroup(access, group)) {
    return { ok: true };
  }
  return {
    ok: false,
    error: isClubGroup(group)
      ? "部全体取引の作成には会計担当または管理者権限が必要です"
      : "この会計グループに登録する権限がありません",
  };
}

/** Reading a club row must never grant the owner permission to write it. */
async function checkExistingClubWrite(
  supabase: SupabaseServerClient,
  access: RoleAccessContext,
  accountingGroupId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isAdminOrAccounting(access) || !accountingGroupId) return { ok: true };
  const { data: group, error } = await supabase
    .from("accounting_groups")
    .select("id, type")
    .eq("id", accountingGroupId)
    .maybeSingle();
  if (error || !group) {
    return { ok: false, error: "会計グループの取得に失敗しました" };
  }
  if (isClubGroup(group)) {
    return { ok: false, error: "部全体取引を変更する権限がありません" };
  }
  return { ok: true };
}

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
  const rateLimitResult = await uploadRateLimiter.check(auth.userId);
  if (!rateLimitResult.success) {
    const retryMinutes = Math.ceil(
      (rateLimitResult.resetAt - Date.now()) / 1000 / 60,
    );
    return {
      error: `アップロード回数の上限に達しました。${retryMinutes}分後に再試行してください。`,
    };
  }

  // Only the file is read. The object name is generated here and nothing is
  // ever deleted or overwritten: replaced files are removed by the record
  // update actions after the new path has been persisted.
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "ファイルは必須です" };
  }

  const validationError = validateReceiptFile(file);
  if (validationError || !isAllowedReceiptMimeType(file.type)) {
    return { error: validationError ?? "ファイル形式が不正です" };
  }

  const extension = RECEIPT_MIME_EXTENSIONS[file.type];
  const filePath = `${auth.userId}/${crypto.randomUUID()}.${extension}`;

  // createAdminClient is required here to bypass storage RLS for receipt uploads
  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin.storage
    .from("receipts")
    .upload(filePath, file, { upsert: false, contentType: file.type });

  if (error) {
    console.error("[uploadReceiptAction] Storage upload error:", error);
    return { error: "アップロードに失敗しました" };
  }

  return { success: true, filePath };
}

export async function createTransaction(
  values: z.infer<typeof formSchema>,
  receiptPath?: string | null,
  transactionId?: string,
) {
  const recordId = transactionId ?? crypto.randomUUID();

  if (transactionId) {
    const idValidation = z.string().uuid().safeParse(transactionId);
    if (!idValidation.success) {
      return { error: "入力データが不正です" };
    }
  }

  const valuesValidation = formSchema.safeParse({
    ...values,
    receipt_url: receiptPath ?? null,
  });
  if (!valuesValidation.success) {
    return { error: "入力データが不正です" };
  }

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;

  // A new receipt must be an object the caller uploaded via uploadReceiptAction.
  if (receiptPath != null && !isReceiptPathOwnedBy(receiptPath, auth.userId)) {
    return { error: RECEIPT_PATH_ERROR };
  }

  const parsedValues = valuesValidation.data;
  const transactionDate = formatDateForDatabase(parsedValues.date);

  const { data: fy, error: fyError } = await auth.supabase
    .from("fiscal_years")
    .select("year")
    .lte("start_date", transactionDate)
    .gte("end_date", transactionDate)
    .single();

  if (fyError) {
    console.error("[createTransaction] Fiscal year fetch error:", fyError);
    return { error: "会計年度の取得に失敗しました" };
  }

  // Resolve financial account. The expense application screen (経費申請) has no
  // wallet selector, so financial_account_id arrives empty. Fall back to the
  // default cash account (金庫), matching the backfill convention.
  let financialAccountId = parsedValues.financial_account_id;
  if (!financialAccountId) {
    const { data: defaultAccount, error: accountError } = await auth.supabase
      .from("financial_accounts")
      .select("id")
      .eq("type", "cash")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (accountError || !defaultAccount) {
      console.error(
        "[createTransaction] Default financial account fetch error:",
        accountError,
      );
      return { error: "財布の取得に失敗しました" };
    }
    financialAccountId = defaultAccount.id;
  }

  const finalAmount =
    parsedValues.type === "expense"
      ? -Math.abs(parsedValues.amount)
      : Math.abs(parsedValues.amount);

  // Determine transaction_kind from type (income/expense)
  const transactionKind = parsedValues.type === "expense" ? "expense" : "income";

  // The user must be allowed to file into the chosen group (club-wide groups:
  // accounting/admin only; restricted groups: members of the group).
  const groupCheck = await checkFilingGroup(
    auth.supabase,
    authResult.access,
    parsedValues.accounting_group_id,
  );
  if (!groupCheck.ok) return { error: groupCheck.error };

  const insertData = {
    id: recordId,
    date: formatDateForDatabase(parsedValues.date),
    amount: finalAmount,
    accounting_group_id: parsedValues.accounting_group_id,
    financial_account_id: financialAccountId,
    transaction_kind: transactionKind,
    description: parsedValues.description,
    created_by: auth.profileId,
    fiscal_year_id: fy?.year ?? null,
    receipt_url: parsedValues.receipt_url ?? null,
    remarks: parsedValues.remarks ?? null,
    // All transactions start as pending; leader/admin approval required.
    // Even admins start as pending to prevent self-approval.
    approval_status: "pending",
  } satisfies TablesInsert<"transactions">;

  const { error: insertError } = await auth.supabase
    .from("transactions")
    .insert(insertData);

  if (insertError) {
    console.error("[createTransaction] Insert error:", insertError);
    return { error: "登録に失敗しました" };
  }

  await logAuditEvent({
    tableName: "transactions",
    recordId,
    action: "INSERT",
    newData: insertData,
    changedBy: auth.profileId,
  });

  revalidatePath("/ledger");
  revalidatePath("/applications");
  return { success: true };
}

const APPROVAL_DENIED_ERRORS: Record<ApprovalDenialReason, string> = {
  forbidden: "承認権限がありません",
  own_transaction: "自分の申請を承認することはできません",
  not_pending: "受付中の申請のみ承認・却下できます",
  past_fiscal_year: "過年度の申請は管理者のみ承認できます",
};

const STALE_TRANSACTION_ERROR =
  "他の操作で内容が変更されたため更新できませんでした。再読み込みしてください";

/**
 * Whether the fiscal year is the current one. null fiscal years count as past;
 * a lookup error returns null so callers can fail closed.
 */
async function isCurrentFiscalYear(
  supabase: SupabaseServerClient,
  fiscalYearId: number | null,
): Promise<boolean | null> {
  if (fiscalYearId === null) return false;
  const { data, error } = await supabase
    .from("fiscal_years")
    .select("is_current")
    .eq("year", fiscalYearId)
    .maybeSingle();
  if (error) {
    console.error("[isCurrentFiscalYear] Fetch error:", error);
    return null;
  }
  return data?.is_current === true;
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

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;
  const access = authResult.access;

  const { data: transaction, error: txFetchError } = await auth.supabase
    .from("transactions")
    .select(
      "accounting_group_id, created_by, approval_status, approved_by, approved_at, rejected_reason, fiscal_year_id",
    )
    .eq("id", transactionId)
    .is("deleted_at", null)
    .single();

  if (txFetchError || !transaction) {
    console.error("[updateTransactionStatus] Fetch error:", txFetchError);
    return { error: "対象のデータが見つかりません" };
  }

  // 承認者は管理者と会計のみ。自分の申請は誰も承認できない（管理者を含む）。
  // 過年度の取引は管理者のみ。
  const isCurrentYear = isAdmin(access)
    ? true
    : await isCurrentFiscalYear(auth.supabase, transaction.fiscal_year_id);
  if (isCurrentYear === null) {
    return { error: "会計年度の取得に失敗しました" };
  }
  const approval = checkTransactionApproval(
    access,
    transaction,
    auth.profileId,
    isCurrentYear,
  );
  if (!approval.ok) {
    return { error: APPROVAL_DENIED_ERRORS[approval.reason] };
  }

  const newStatusData = approvalFieldsForDecision(
    validation.data.status,
    auth.profileId,
    new Date().toISOString(),
    validation.data.reason,
  );

  // Conditional write: only a still-pending row with the creator and fiscal
  // year read above is decided. A concurrent decision (or RLS) leaves 0 rows.
  let updateQuery = auth.supabase
    .from("transactions")
    .update(newStatusData)
    .eq("id", transactionId)
    .eq("approval_status", "pending")
    .is("deleted_at", null);
  updateQuery =
    transaction.created_by === null
      ? updateQuery.is("created_by", null)
      : updateQuery.eq("created_by", transaction.created_by);
  updateQuery =
    transaction.fiscal_year_id === null
      ? updateQuery.is("fiscal_year_id", null)
      : updateQuery.eq("fiscal_year_id", transaction.fiscal_year_id);

  const { data: updatedRows, error: updateError } =
    await updateQuery.select("id");

  if (updateError) {
    console.error("[updateTransactionStatus] Update error:", updateError);
    return { error: "ステータス更新に失敗しました" };
  }
  if (!updatedRows || updatedRows.length !== 1) {
    return { error: STALE_TRANSACTION_ERROR };
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
  // UUID columns must be validated before PostgREST casts the JSON payload.
  const referencesValidation = updateTransactionReferencesSchema.safeParse({
    id,
    accountingGroupId: values.accounting_group_id,
    financialAccountId: values.financial_account_id,
  });
  if (!referencesValidation.success) {
    return { error: "入力データが不正です" };
  }

  // Runtime validation of form values
  const valuesValidation = formSchema.safeParse(values);
  if (!valuesValidation.success) {
    return { error: "入力データが不正です" };
  }

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;
  const access = authResult.access;
  const accountingUserId = await getAccountingUserId();

  const { data: transaction, error: txFetchError } = await auth.supabase
    .from("transactions")
    .select(
      "accounting_group_id, created_by, approval_status, approved_by, approved_at, rejected_reason, amount, receipt_url, fiscal_year_id",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (txFetchError || !transaction) {
    console.error("[updateTransaction] Fetch error:", txFetchError);
    return { error: "対象のデータが見つかりません" };
  }

  const clubWrite = await checkExistingClubWrite(
    auth.supabase,
    access,
    transaction.accounting_group_id,
  );
  if (!clubWrite.ok) return { error: clubWrite.error };

  // 編集できるのは管理者・会計、または pending の自分の取引のみ（班長は不可）。
  if (!canEditTransaction(access, transaction, auth.profileId)) {
    const isOwner = transaction.created_by === auth.profileId;
    return {
      error: isOwner
        ? "受付中以外のデータは編集できません"
        : "更新できませんでした（権限がない可能性があります）",
    };
  }

  // Moving to another group needs permission on the destination. Unchanged
  // groups are not re-checked, so legacy rows stay editable.
  if (values.accounting_group_id !== transaction.accounting_group_id) {
    const groupCheck = await checkFilingGroup(
      auth.supabase,
      access,
      values.accounting_group_id,
    );
    if (!groupCheck.ok) return { error: groupCheck.error };
  }

  // receipt_url: undefined = keep, null = clear, same value = keep (legacy
  // paths included). A changed value must be an object the caller uploaded.
  const previousReceiptPath = transaction.receipt_url;
  const isReceiptChanged =
    values.receipt_url !== undefined &&
    values.receipt_url !== previousReceiptPath;
  if (
    isReceiptChanged &&
    values.receipt_url != null &&
    !isReceiptPathOwnedBy(values.receipt_url, auth.userId)
  ) {
    return { error: RECEIPT_PATH_ERROR };
  }

  const updateDate = formatDateForDatabase(values.date);
  const { data: fy } = await auth.supabase
    .from("fiscal_years")
    .select("year")
    .lte("start_date", updateDate)
    .gte("end_date", updateDate)
    .single();

  // Moving a past fiscal year's transaction into another year is admin-only;
  // otherwise 会計 could move a past row into the current year and approve it
  // (D7). Rows without a fiscal year can still be corrected.
  const newFiscalYearId = fy?.year ?? null;
  if (
    !isAdmin(access) &&
    transaction.fiscal_year_id !== null &&
    newFiscalYearId !== transaction.fiscal_year_id
  ) {
    const isStoredYearCurrent = await isCurrentFiscalYear(
      auth.supabase,
      transaction.fiscal_year_id,
    );
    if (isStoredYearCurrent === null) {
      return { error: "会計年度の取得に失敗しました" };
    }
    if (!isStoredYearCurrent) {
      return { error: "過年度の取引を別の年度に移せるのは管理者のみです" };
    }
  }

  const effectiveType = values.type;
  const finalAmount =
    effectiveType === "expense"
      ? -Math.abs(values.amount)
      : Math.abs(values.amount);

  const contentUpdates: TablesUpdate<"transactions"> = {
    amount: finalAmount,
    description: values.description,
    fiscal_year_id: newFiscalYearId,
    date: formatDateForDatabase(values.date),
    accounting_group_id: values.accounting_group_id,
    financial_account_id: values.financial_account_id,
    transaction_kind: effectiveType === "expense" ? "expense" : "income",
    ...(values.receipt_url !== undefined && { receipt_url: values.receipt_url }),
    ...(values.remarks !== undefined && { remarks: values.remarks }),
  };

  // 申請者・承認者の付け替えは管理者のみ（それ以外の値は無視する）。
  const canReassign = canReassignTransactionPeople(access);
  const newCreatedBy =
    canReassign && values.created_by !== undefined
      ? (normalizeAccountingUserId(values.created_by, accountingUserId) ??
        values.created_by)
      : transaction.created_by;
  const requestedApprovedBy =
    canReassign && values.approved_by !== undefined
      ? normalizeAccountingUserId(
          values.approved_by === "clear" ? null : values.approved_by,
          accountingUserId,
        )
      : undefined;

  // 承認項目は実際に変わる場合だけ書き込む（フォームは現在値を毎回送るため）。
  // 承認ステータスの直接変更は管理者・会計のみ。通常の承認フローは
  // updateTransactionStatus を使う。
  const requestedStatus = isAdminOrAccounting(access)
    ? values.approval_status
    : undefined;
  const isStatusChanged =
    requestedStatus !== undefined &&
    requestedStatus !== transaction.approval_status;
  const isApprovedByChanged =
    requestedApprovedBy !== undefined &&
    requestedApprovedBy !== transaction.approved_by;

  const now = new Date().toISOString();
  let approvalUpdates: ApprovalFields = {};
  let isAdminSelfRowCorrection = false;

  if (isStatusChanged || isApprovedByChanged) {
    const isOwnRow =
      transaction.created_by === auth.profileId ||
      newCreatedBy === auth.profileId;
    const isCurrentYear = isAdmin(access)
      ? true
      : await isCurrentFiscalYearPair(
          auth.supabase,
          transaction.fiscal_year_id,
          newFiscalYearId,
        );
    if (isCurrentYear === null) {
      return { error: "会計年度の取得に失敗しました" };
    }
    if (
      !canSetApprovalFieldsDirectly(access, {
        isOwnRow,
        isCurrentFiscalYear: isCurrentYear,
      })
    ) {
      if (isOwnRow) {
        return { error: "自分の申請の承認ステータスは変更できません" };
      }
      return { error: "過年度の承認ステータスは管理者のみ変更できます" };
    }

    approvalUpdates = {
      ...(isStatusChanged &&
        approvalFieldsForStatusChange(requestedStatus, auth.profileId, now)),
      ...(isApprovedByChanged && { approved_by: requestedApprovedBy }),
    };
    isAdminSelfRowCorrection = isAdmin(access) && isOwnRow;
  }

  const updates: TablesUpdate<"transactions"> = {
    ...contentUpdates,
    ...(canReassign &&
      newCreatedBy !== transaction.created_by && { created_by: newCreatedBy }),
    ...approvalUpdates,
  };

  const auditOldData = {
    amount: transaction.amount,
    created_by: transaction.created_by,
    approval_status: transaction.approval_status,
    approved_by: transaction.approved_by,
    approved_at: transaction.approved_at,
    rejected_reason: transaction.rejected_reason,
  };
  const breakGlassMarker = isAdminSelfRowCorrection
    ? { break_glass: ADMIN_SELF_ROW_CORRECTION }
    : {};

  // Break-glass: an admin changing approval fields on their own row is only
  // allowed with an audit record. The record is written first and the change
  // is aborted when it cannot be stored (fail closed). If the update then
  // fails, the record stays as an attempt (phase "intent").
  if (isAdminSelfRowCorrection) {
    const audit = await recordAuditEvent({
      tableName: "transactions",
      recordId: id,
      action: "UPDATE",
      oldData: auditOldData,
      newData: { ...updates, ...breakGlassMarker, phase: "intent" },
      changedBy: auth.profileId,
    });
    if (!audit.ok) {
      return { error: "監査ログを記録できなかったため、変更を中止しました" };
    }
  }

  // Conditional write: every value read above that the permission checks or
  // the audit record depend on must be unchanged, so a concurrent decision or
  // correction is never overwritten. RLS or a concurrent change leaves 0 rows,
  // which is reported as an error.
  let updateQuery = auth.supabase
    .from("transactions")
    .update(updates)
    .eq("id", id)
    .eq("approval_status", transaction.approval_status)
    .is("deleted_at", null);
  updateQuery =
    transaction.created_by === null
      ? updateQuery.is("created_by", null)
      : updateQuery.eq("created_by", transaction.created_by);
  updateQuery =
    transaction.approved_by === null
      ? updateQuery.is("approved_by", null)
      : updateQuery.eq("approved_by", transaction.approved_by);
  updateQuery =
    transaction.approved_at === null
      ? updateQuery.is("approved_at", null)
      : updateQuery.eq("approved_at", transaction.approved_at);
  updateQuery =
    transaction.rejected_reason === null
      ? updateQuery.is("rejected_reason", null)
      : updateQuery.eq("rejected_reason", transaction.rejected_reason);
  updateQuery =
    transaction.fiscal_year_id === null
      ? updateQuery.is("fiscal_year_id", null)
      : updateQuery.eq("fiscal_year_id", transaction.fiscal_year_id);

  const { data: updatedRows, error: updateError } =
    await updateQuery.select("id");

  if (updateError) {
    console.error("[updateTransaction] Update error:", updateError);
    return { error: "更新に失敗しました。しばらくしてから再試行してください。" };
  }
  if (!updatedRows || updatedRows.length !== 1) {
    return { error: STALE_TRANSACTION_ERROR };
  }

  // Remove the replaced file only after the record points to the new one.
  // The helper re-checks references, so a no-op update keeps the old file.
  if (isReceiptChanged) {
    await removeReplacedReceipt({
      oldPath: previousReceiptPath,
      newPath: values.receipt_url,
      actorUserId: auth.userId,
    });
  }

  await logAuditEvent({
    tableName: "transactions",
    recordId: id,
    action: "UPDATE",
    oldData: auditOldData,
    newData: { ...updates, ...breakGlassMarker },
    changedBy: auth.profileId,
  });

  revalidatePath("/ledger");
  revalidatePath("/applications");
  return { success: true };
}

/** Both the stored and the new fiscal year must be current (null → past). */
async function isCurrentFiscalYearPair(
  supabase: SupabaseServerClient,
  storedFiscalYearId: number | null,
  newFiscalYearId: number | null,
): Promise<boolean | null> {
  const stored = await isCurrentFiscalYear(supabase, storedFiscalYearId);
  if (stored !== true || newFiscalYearId === storedFiscalYearId) return stored;
  return isCurrentFiscalYear(supabase, newFiscalYearId);
}

export async function deleteTransaction(id: string) {
  // Validate id
  const validation = deleteTransactionSchema.safeParse({ id });
  if (!validation.success) {
    return { error: "入力データが不正です" };
  }

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;
  const access = authResult.access;

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

  const clubWrite = await checkExistingClubWrite(
    auth.supabase,
    access,
    transaction.accounting_group_id,
  );
  if (!clubWrite.ok) return { error: clubWrite.error };

  if (!canDeleteTransaction(access, transaction, auth.profileId)) {
    return { error: "削除する権限がありません。" };
  }

  const { data: deletedRows, error: deleteError } = await auth.supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .select("id");

  if (deleteError) {
    console.error("[deleteTransaction] Delete error:", deleteError);
    return { error: "削除に失敗しました。しばらくしてから再試行してください。" };
  }
  // RLS (or a concurrent change) can filter the DELETE to 0 rows.
  if (!deletedRows || deletedRows.length !== 1) {
    return { error: STALE_TRANSACTION_ERROR };
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
