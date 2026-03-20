"use server";

import { createClient } from "@/utils/supabase/server";
import {
  extractStudentNumberFromUser,
  findProfileIdByStudentNumber,
} from "@/lib/account";
import { logAuditEvent } from "@/lib/audit-log";
import { getAccountingUserIdSync } from "@/lib/system-config";
import {
  updateSubsidyStatusSchema,
  updateSubsidyItemSchema,
  deleteSubsidyItemSchema,
  validateInput,
} from "@/lib/validations";

// --- Role type ---
type RoleRow = {
  name?: string | null;
  type?: string | null;
};

type UserRoleRow = {
  roles?: RoleRow | null;
};

export async function fetchAllSubsidies() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "認証が必要です", data: [] };
  }

  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);

  if (!profileId) {
    return { error: "プロファイルが見つかりません", data: [] };
  }

  // Role validation: Accounting or Admin only
  const { data: userRoles, error: rolesError } = await supabase
    .from("user_roles")
    .select("roles(name, type)")
    .eq("user_id", profileId);

  if (rolesError) {
    console.error("Fetch roles error:", rolesError);
    return { error: "権限の確認に失敗しました", data: [] };
  }

  const hasAccessRole = (userRoles as UserRoleRow[] || []).some(
    (row) => row.roles?.name === "会計" || row.roles?.type === "admin",
  );

  const isAdmin =
    (userRoles as UserRoleRow[] || []).some((row) => row.roles?.type === "admin") || false;

  if (!hasAccessRole) {
    return {
      error: "このページにアクセスする権限がありません",
      data: [],
      isAdmin: false,
    };
  }

  // Fetch all subsidies including applicant name and transactions
  // Uses createClient() with RLS - role-based access is enforced by RLS policies
  const { data, error } = await supabase
    .from("subsidy_items")
    .select(
      "id,category,term,expense_type,name,applicant_id,accounting_group_id,requested_amount,approved_amount,actual_amount,status,created_at,receipt_date,receipt_url,remarks,profiles!subsidy_items_applicant_id_fkey(name),accounting_groups!subsidy_items_accounting_group_id_fkey(name)",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

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
    remarks: string | null;
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
      created_at: item.created_at,
      receipt_date: item.receipt_date,
      receipt_url: item.receipt_url,
      applicant_name:
        item.applicant_id === accountingUserId
          ? "会計"
          : item.profiles?.name || "不明",
    };
  });

  return { success: true, data: processedData, isAdmin };
}

export async function fetchProfilesList() {
  // Uses createClient() with RLS - profile list access is controlled by RLS policies
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name")
    .is("deleted_at", null)
    .order("name");

  if (error) {
    console.error("fetchProfilesList error:", error);
    return { error: "ユーザー一覧の取得に失敗しました", data: [] };
  }

  return { success: true, data };
}

export async function updateSubsidyStatus(id: string, status: string) {
  const inputValidation = validateInput(updateSubsidyStatusSchema, {
    id,
    status,
  });
  if (!inputValidation.success) {
    return { error: "入力データが不正です" };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "認証が必要です" };
  }

  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);

  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("roles(name, type)")
    .eq("user_id", profileId);

  const hasAccessRole = (userRoles as UserRoleRow[] || []).some(
    (row) => row.roles?.name === "会計" || row.roles?.type === "admin",
  );

  if (!hasAccessRole) {
    return { error: "権限がありません" };
  }

  // Uses createClient() with RLS - authorization is enforced by RLS policies
  const { error } = await supabase
    .from("subsidy_items")
    .update({ status })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    console.error("updateSubsidyStatus error:", error);
    return { error: "ステータスの更新に失敗しました" };
  }

  await logAuditEvent({
    tableName: "subsidy_items",
    recordId: id,
    action: "UPDATE",
    newData: { status },
    changedBy: profileId!,
  });

  if (status === "unexecuted") {
    // Soft delete related transactions instead of physical delete
    const { data: relatedTx, error: txError } = await supabase
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("subsidy_item_id", id)
      .is("deleted_at", null)
      .select("id");

    if (txError) {
      console.error("Failed to soft-delete related transactions:", txError);
      return { error: "関連する出納帳データの削除に失敗しました" };
    }

    // Log audit events for each soft-deleted transaction
    if (relatedTx) {
      for (const tx of relatedTx) {
        await logAuditEvent({
          tableName: "transactions",
          recordId: tx.id,
          action: "SOFT_DELETE",
          oldData: { subsidy_item_id: id },
          newData: { deleted_at: new Date().toISOString() },
          changedBy: profileId!,
        });
      }
    }
  }

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
  },
) {
  const inputValidation = validateInput(updateSubsidyItemSchema, {
    id,
    updates,
  });
  if (!inputValidation.success) {
    return { error: "入力データが不正です" };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "認証が必要です" };
  }

  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);

  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("roles(name, type)")
    .eq("user_id", profileId);

  const hasAccessRole = (userRoles as UserRoleRow[] || []).some(
    (row) => row.roles?.name === "会計" || row.roles?.type === "admin",
  );

  if (!hasAccessRole) {
    return { error: "権限がありません" };
  }

  // Uses createClient() with RLS - authorization is enforced by RLS policies
  const { error } = await supabase
    .from("subsidy_items")
    .update(updates)
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    console.error("updateSubsidyItem error:", error);
    return { error: "申請情報の更新に失敗しました" };
  }

  await logAuditEvent({
    tableName: "subsidy_items",
    recordId: id,
    action: "UPDATE",
    newData: updates as Record<string, unknown>,
    changedBy: profileId!,
  });

  return { success: true };
}

export async function deleteSubsidyItem(id: string) {
  const inputValidation = validateInput(deleteSubsidyItemSchema, { id });
  if (!inputValidation.success) {
    return { error: "入力データが不正です" };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "認証が必要です" };
  }

  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);

  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("roles(name, type)")
    .eq("user_id", profileId);

  const hasAccessRole = (userRoles as UserRoleRow[] || []).some(
    (row) => row.roles?.name === "会計" || row.roles?.type === "admin",
  );

  if (!hasAccessRole) {
    return { error: "権限がありません" };
  }

  // Soft delete instead of physical delete
  // Uses createClient() with RLS - authorization is enforced by RLS policies
  const { error } = await supabase
    .from("subsidy_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    console.error("deleteSubsidyItem error:", error);
    return { error: "申請の削除に失敗しました" };
  }

  await logAuditEvent({
    tableName: "subsidy_items",
    recordId: id,
    action: "SOFT_DELETE",
    newData: { deleted_at: new Date().toISOString() },
    changedBy: profileId!,
  });

  return { success: true };
}
