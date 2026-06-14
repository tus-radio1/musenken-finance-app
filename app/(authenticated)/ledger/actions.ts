"use server";

/**
 * 出納帳データ取得の Server Action。
 *
 * 権限モデル:
 *   - 管理者・会計・部長・副部長: 全グループのデータ閲覧可
 *   - 一般部員: general タイプのグループ + 自分が所属するグループのみ
 * アクセス判定の順序:
 *   1. isFullAccess (admin/accounting/chair/vice_chair) → 無条件OK
 *   2. general タイプのグループ → 全ユーザーに公開
 *   3. 所属グループ → ロール割当で判定
 */

import { getAccountingUserIdSync } from "@/lib/system-config";
import {
  fetchLedgerTransactionsSchema,
  createTransferSchema,
  validateInput,
} from "@/lib/validations";
import { resolveAuthWithRoles } from "@/lib/auth/context";
import { ROLE_NAMES_JA } from "@/lib/roles/constants";
import { revalidatePath } from "next/cache";
import { canViewClubLedger } from "@/lib/auth/permissions";

import {
  TransactionRow,
  SubsidyItemData,
  synthesizeLedgerRows,
} from "@/lib/ledger";

export async function fetchLedgerTransactions(params: {
  accountingGroupId: string;
  fyYear?: number;
}) {
  const validation = validateInput(fetchLedgerTransactionsSchema, params);
  if (!validation.success) {
    return { error: "入力データが不正です" as const };
  }

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;
  const access = authResult.access;

  const isAccountingUser = access.hasAccountingRole;
  const isFullAccess =
    access.isAdmin ||
    isAccountingUser ||
    access.roles.some(
      (r) =>
        r.name === ROLE_NAMES_JA.CHAIR || r.name === ROLE_NAMES_JA.VICE_CHAIR,
    );

  const requestedGroupId = params.accountingGroupId;

  // Check group type for access control
  const { data: groupInfo } = await auth.supabase
    .from("accounting_groups")
    .select("type")
    .eq("id", requestedGroupId)
    .maybeSingle();

  const isClubGroup = groupInfo?.type === "club";
  const isGeneralGroup = groupInfo?.type === "general";

  // Club-wide group: only accounting/admin can view
  if (isClubGroup && !canViewClubLedger(access)) {
    return { error: "アクセス権限がありません" as const };
  }

  const belongsToRequested = access.roles.some(
    (r) => r.accountingGroupId && r.accountingGroupId === requestedGroupId,
  );

  if (!isClubGroup && !isFullAccess && !isGeneralGroup && !belongsToRequested) {
    return { error: "アクセス権限がありません" as const };
  }

  // transactions, subsidy_items, profiles, budgets を並列取得 (RLS handles authorization)
  let txQuery = auth.supabase
    .from("transactions")
    .select(
      "id, date, amount, description, accounting_group_id, approval_status, receipt_url, created_by, approved_by, rejected_reason, remarks, subsidy_item_id, financial_account_id, transaction_kind, transfer_id",
    )
    .eq("accounting_group_id", requestedGroupId)
    .order("date", { ascending: false });

  if (typeof params.fyYear !== "undefined") {
    txQuery = txQuery.eq("fiscal_year_id", params.fyYear);
  }

  let subsidyQuery = auth.supabase
    .from("subsidy_items")
    .select(
      "id, name, requested_amount, approved_amount, actual_amount, created_at, applicant_id, receipt_date, status",
    )
    .eq("accounting_group_id", requestedGroupId)
    .in("status", ["approved", "receipt_submitted", "paid"])
    .is("deleted_at", null);

  if (typeof params.fyYear !== "undefined") {
    subsidyQuery = subsidyQuery.eq("fiscal_year_id", params.fyYear);
  }

  // プロフィール取得は取引データ取得後に必要な ID だけを取得する（B-6/P-2 修正）
  const budgetQuery =
    typeof params.fyYear !== "undefined"
      ? auth.supabase
          .from("budgets")
          .select("amount, carryover_amount")
          .eq("accounting_group_id", requestedGroupId)
          .eq("fiscal_year_id", params.fyYear)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });

  const [txResult, subsidyResult, budgetResult] =
    await Promise.all([txQuery, subsidyQuery, budgetQuery]);

  if (txResult.error) {
    console.error("[fetchLedgerTransactions] Transaction fetch error:", txResult.error);
    return { error: "データの取得に失敗しました" as const };
  }

  // Fetch financial account names for display
  const { data: financialAccounts } = await auth.supabase
    .from("financial_accounts")
    .select("id, name")
    .order("display_order");
  const faNameMap: Record<string, string> = {};
  for (const fa of financialAccounts || []) {
    faNameMap[fa.id] = fa.name;
  }

  const txRows: TransactionRow[] = (txResult.data || []).map((row) => ({
    id: row.id,
    date: row.date,
    amount: row.amount,
    description: row.description,
    accounting_group_id: row.accounting_group_id,
    approval_status: row.approval_status,
    receipt_url: row.receipt_url,
    created_by: row.created_by,
    approved_by: row.approved_by,
    rejected_reason: row.rejected_reason,
    remarks: row.remarks,
    subsidy_item_id: row.subsidy_item_id,
    financial_account_id: row.financial_account_id,
    financial_account_name: faNameMap[row.financial_account_id] ?? null,
    transaction_kind: row.transaction_kind,
    transfer_id: row.transfer_id,
  }));
  const subsidyData = subsidyResult.data ?? [];

  // TransactionRow と 仮想行 を結合
  const combinedRows = synthesizeLedgerRows(
    txRows,
    subsidyData as SubsidyItemData[],
    requestedGroupId,
  );

  // プロフィール名マップ構築 — 取引に登場する ID のみを取得する（B-6/P-2）
  const profileIds = new Set<string>();
  for (const row of combinedRows) {
    if (row.created_by) profileIds.add(row.created_by);
    if (row.approved_by) profileIds.add(row.approved_by);
  }
  // 会計ユーザーIDは静的に名前を設定するので取得対象から除外可
  const accountingId = getAccountingUserIdSync();
  profileIds.delete(accountingId);

  let profileNameMap: Record<string, string> = {};
  const idArray = Array.from(profileIds);
  if (idArray.length > 0) {
    const { data: profilesData } = await auth.supabase
      .from("profiles")
      .select("id, name")
      .in("id", idArray)
      .is("deleted_at", null);
    profileNameMap = Object.fromEntries(
      (profilesData || []).map((p) => [p.id, p.name || p.id]),
    );
  }
  profileNameMap[accountingId] = "会計";

  // Budget amount and carryover
  const budgetAmount = Number(budgetResult.data?.amount) || 0;
  const carryoverAmount = Number(budgetResult.data?.carryover_amount) || 0;

  const publicReceiptBase = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/receipts/`
    : null;

  const enriched = combinedRows.map((t) => ({
    ...t,
    created_by_name: t.created_by
      ? profileNameMap[t.created_by] || "未登録"
      : "未登録",
    approved_by_name: t.approved_by
      ? profileNameMap[t.approved_by] || "未登録"
      : null,
    receipt_public_url: t.receipt_url?.startsWith("http")
      ? t.receipt_url
      : publicReceiptBase && t.receipt_url
        ? `${publicReceiptBase}${t.receipt_url}`
        : null,
    remarks: t.remarks || null,
  }));

  return { data: enriched, budgetAmount, carryoverAmount };
}

/**
 * Fetch active financial accounts for form selectors.
 */
export async function fetchFinancialAccounts() {
  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;

  const { data, error } = await auth.supabase
    .from("financial_accounts")
    .select("id, name, type, is_active, display_order")
    .eq("is_active", true)
    .order("display_order");

  if (error) {
    console.error("[fetchFinancialAccounts] Error:", error);
    return { error: "財布データの取得に失敗しました" as const };
  }

  return { data: data || [] };
}

/**
 * Create a fund transfer (資金移動) between two financial accounts.
 * Atomically inserts 2 transaction rows via the create_transfer RPC.
 * Only accounting staff and admins can create transfers.
 */
export async function createTransfer(params: {
  date: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  description: string;
  receiptUrl?: string | null;
  remarks?: string | null;
}) {
  const validation = validateInput(createTransferSchema, params);
  if (!validation.success) {
    return { error: validation.error };
  }

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;
  const access = authResult.access;

  // Only accounting/admin can create transfers
  if (!access.isAdmin && !access.hasAccountingRole) {
    return { error: "資金移動の作成には会計担当または管理者権限が必要です" };
  }

  const { data: transferId, error: rpcError } = await auth.supabase.rpc(
    "create_transfer",
    {
      p_date: params.date,
      p_amount: params.amount,
      p_from_account_id: params.fromAccountId,
      p_to_account_id: params.toAccountId,
      p_description: params.description,
      p_receipt_url: params.receiptUrl ?? null,
      p_remarks: params.remarks ?? null,
      p_created_by: auth.profileId,
    },
  );

  if (rpcError) {
    console.error("[createTransfer] RPC error:", rpcError);
    return { error: "資金移動の作成に失敗しました" };
  }

  revalidatePath("/ledger");
  return { success: true, transferId };
}
