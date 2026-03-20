"use server";

import { createClient } from "@/utils/supabase/server";
import { getAccountingUserIdSync } from "@/lib/system-config";
import {
  fetchLedgerTransactionsSchema,
  validateInput,
} from "@/lib/validations";

type Role = {
  name: string | null;
  type: string | null;
  accounting_group_id: string | null;
};

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

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" as const };

  const profileId = user.id;

  // profile と roles を並列取得
  const [{ data: profile }, { data: userRoles }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", profileId).maybeSingle(),
    supabase
      .from("user_roles")
      .select("roles(name, type, accounting_group_id)")
      .eq("user_id", profileId),
  ]);

  const roles: Role[] = (userRoles || []).flatMap((ur) => {
    const rr = (ur as unknown as { roles?: Role | Role[] | null }).roles;
    if (Array.isArray(rr)) return rr;
    return rr ? [rr] : [];
  });
  const isGlobalAdmin = roles.some((r) => r?.type === "admin");
  const isAccountingUser =
    profile?.role === "accounting" || roles.some((r) => r?.name === "会計");
  const isFullAccess =
    isGlobalAdmin ||
    isAccountingUser ||
    roles.some((r) => r?.name === "部長" || r?.name === "副部長");

  const requestedGroupId = params.accountingGroupId;

  // general タイプのグループは全ユーザーに公開
  let isGeneralGroup = false;
  if (!isFullAccess) {
    const { data: groupInfo } = await supabase
      .from("accounting_groups")
      .select("type")
      .eq("id", requestedGroupId)
      .maybeSingle();
    isGeneralGroup =
      (groupInfo as unknown as { type?: string } | null)?.type === "general";
  }

  const belongsToRequested = roles.some(
    (r) => r?.accounting_group_id && r.accounting_group_id === requestedGroupId,
  );

  if (!isFullAccess && !isGeneralGroup && !belongsToRequested) {
    return { error: "アクセス権限がありません" as const };
  }

  // transactions, subsidy_items, profiles, budgets を並列取得 (RLS handles authorization)
  let txQuery = supabase
    .from("transactions")
    .select(
      "id, date, amount, description, accounting_group_id, approval_status, receipt_url, created_by, approved_by, rejected_reason, remarks, subsidy_item_id",
    )
    .eq("accounting_group_id", requestedGroupId)
    .is("deleted_at", null)
    .order("date", { ascending: false });

  if (typeof params.fyYear !== "undefined") {
    txQuery = txQuery.eq("fiscal_year_id", params.fyYear);
  }

  let subsidyQuery = supabase
    .from("subsidy_items")
    .select(
      "id, name, requested_amount, approved_amount, actual_amount, created_at, applicant_id, receipt_date, status",
    )
    .eq("accounting_group_id", requestedGroupId)
    .is("deleted_at", null)
    .in("status", ["approved", "receipt_submitted", "paid"]);

  if (typeof params.fyYear !== "undefined") {
    subsidyQuery = subsidyQuery.eq("fiscal_year_id", params.fyYear);
  }

  const profilesQuery = supabase
    .from("profiles")
    .select("id, name")
    .is("deleted_at", null);

  const budgetQuery =
    typeof params.fyYear !== "undefined"
      ? supabase
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
  const subsidyData = subsidyResult.data;

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
