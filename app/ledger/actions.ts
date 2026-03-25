"use server";

import { getAccountingUserIdSync } from "@/lib/system-config";
import {
  fetchLedgerTransactionsSchema,
  validateInput,
} from "@/lib/validations";
import { resolveAuthContext } from "@/lib/auth/context";
import { getUserRoleAccess } from "@/lib/roles/access";
import { ROLE_NAMES_JA } from "@/lib/roles/constants";

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

  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;

  const access = await getUserRoleAccess(auth);

  const isAccountingUser = access.hasAccountingRole;
  const isFullAccess =
    access.isAdmin ||
    isAccountingUser ||
    access.roles.some(
      (r) =>
        r.name === ROLE_NAMES_JA.CHAIR || r.name === ROLE_NAMES_JA.VICE_CHAIR,
    );

  const requestedGroupId = params.accountingGroupId;

  // general タイプのグループは全ユーザーに公開
  let isGeneralGroup = false;
  if (!isFullAccess) {
    const { data: groupInfo } = await auth.supabase
      .from("accounting_groups")
      .select("type")
      .eq("id", requestedGroupId)
      .maybeSingle();
    isGeneralGroup =
      (groupInfo as unknown as { type?: string } | null)?.type === "general";
  }

  const belongsToRequested = access.roles.some(
    (r) => r.accountingGroupId && r.accountingGroupId === requestedGroupId,
  );

  if (!isFullAccess && !isGeneralGroup && !belongsToRequested) {
    return { error: "アクセス権限がありません" as const };
  }

  // transactions, subsidy_items, profiles, budgets を並列取得 (RLS handles authorization)
  let txQuery = auth.supabase
    .from("transactions")
    .select(
      "id, date, amount, description, accounting_group_id, approval_status, receipt_url, created_by, approved_by, rejected_reason, remarks, subsidy_item_id",
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

  const profilesQuery = auth.supabase
    .from("profiles")
    .select("id, name")
    .is("deleted_at", null);

  const budgetQuery =
    typeof params.fyYear !== "undefined"
      ? auth.supabase
          .from("budgets")
          .select("amount")
          .eq("accounting_group_id", requestedGroupId)
          .eq("fiscal_year_id", params.fyYear)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });

  const [txResult, subsidyResult, profilesResult, budgetResult] =
    await Promise.all([txQuery, subsidyQuery, profilesQuery, budgetQuery]);

  if (txResult.error) {
    console.error("[fetchLedgerTransactions] Transaction fetch error:", txResult.error);
    return { error: "データの取得に失敗しました" as const };
  }

  const txRows: TransactionRow[] = (txResult.data ||
    []) as unknown as TransactionRow[];
  const subsidyData = subsidyResult.data ?? [];

  // TransactionRow と 仮想行 を結合
  const combinedRows = synthesizeLedgerRows(
    txRows,
    subsidyData as SubsidyItemData[],
    requestedGroupId,
  );

  // プロフィール名マップ構築
  const profileNameMap: Record<string, string> = Object.fromEntries(
    (profilesResult.data || []).map((p) => {
      const row = p as unknown as { id: string; name?: string | null };
      return [row.id, row.name || row.id];
    }),
  );
  profileNameMap[getAccountingUserIdSync()] = "会計";

  // 予算額
  const budgetAmount =
    Number(
      (budgetResult.data as unknown as { amount?: unknown } | null)?.amount,
    ) || 0;

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

  return { data: enriched, budgetAmount };
}
