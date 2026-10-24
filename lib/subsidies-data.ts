import "server-only";

import type { AuthContext } from "@/lib/auth/types";
import type { RoleAccessContext } from "@/lib/roles/types";
import { canManageSubsidies, isAdmin } from "@/lib/roles/permissions";
import { getAccountingUserIdSync } from "@/lib/system-config";

export async function readAllSubsidies(auth: AuthContext, access: RoleAccessContext, year?: number) {
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

export async function readProfilesList(auth: AuthContext) {
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
