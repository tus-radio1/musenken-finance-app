import "server-only";

import type { AuthContext } from "@/lib/auth/types";
import type { RoleAccessContext } from "@/lib/roles/types";
import { canViewGroup } from "@/lib/roles/permissions";
import { getAccountingUserIdSync } from "@/lib/system-config";
import { getReceiptViewUrl } from "@/lib/receipt-url";
import { type TransactionRow, type SubsidyItemData, synthesizeLedgerRows } from "@/lib/ledger";

type LedgerLookups = {
  profiles: { id: string; name: string }[];
  financialAccounts: { id: string; name: string }[];
};

/** Internal read shared by SSR and the authenticated Server Action.
 * Lookups may only come from server code, never from action arguments.
 * Group type is always read fresh with the user's RLS client for authorization.
 */
export async function readLedgerTransactions(
  auth: AuthContext,
  access: RoleAccessContext,
  params: { accountingGroupId: string; fyYear?: number },
  lookups?: LedgerLookups,
) {
  const requestedGroupId = params.accountingGroupId;

  // Check group type for access control. A missing group or a lookup error
  // denies access.
  const { data: groupInfo, error: groupError } = await auth.supabase
    .from("accounting_groups")
    .select("id, type")
    .eq("id", requestedGroupId)
    .maybeSingle();

  if (groupError) {
    console.error("[fetchLedgerTransactions] Group fetch error:", groupError);
  }
  if (!canViewGroup(access, groupError ? null : groupInfo)) {
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

  const [txResult, subsidyResult, budgetResult, { data: financialAccounts }] =
    await Promise.all([
      txQuery, subsidyQuery, budgetQuery,
      lookups
        ? Promise.resolve({ data: lookups.financialAccounts })
        : auth.supabase.from("financial_accounts").select("id, name").order("display_order"),
    ]);

  if (txResult.error) {
    console.error("[fetchLedgerTransactions] Transaction fetch error:", txResult.error);
    return { error: "データの取得に失敗しました" as const };
  }

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
    const profilesData = lookups
      ? lookups.profiles
      : (await auth.supabase.from("profiles").select("id, name")
          .in("id", idArray).is("deleted_at", null)).data;
    profileNameMap = Object.fromEntries(
      (profilesData || []).map((p) => [p.id, p.name || p.id]),
    );
  }
  profileNameMap[accountingId] = "会計";

  // Budget amount and carryover
  const budgetAmount = Number(budgetResult.data?.amount) || 0;
  const carryoverAmount = Number(budgetResult.data?.carryover_amount) || 0;

  const enriched = combinedRows.map((t) => ({
    ...t,
    accounting_group_type: groupInfo?.type ?? null,
    created_by_name: t.created_by
      ? profileNameMap[t.created_by] || "未登録"
      : "未登録",
    approved_by_name: t.approved_by
      ? profileNameMap[t.approved_by] || "未登録"
      : null,
    receipt_public_url: getReceiptViewUrl(t.receipt_url),
    remarks: t.remarks || null,
  }));

  return { data: enriched, budgetAmount, carryoverAmount };
}
