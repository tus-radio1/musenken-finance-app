"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { format } from "date-fns";
import { subsidyFormSchema } from "@/lib/schema";
import { resolveAuthContext } from "@/lib/auth/context";
import {
  updateMySubsidyItemSchema,
  deleteSubsidyItemSchema,
  validateInput,
} from "@/lib/validations";
import { getUserRoleAccess } from "@/lib/roles/access";

export async function createSubsidyItem(
  values: z.infer<typeof subsidyFormSchema>,
) {
  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;

  // 現在の会計年度を取得
  const { data: fy } = await auth.supabase
    .from("fiscal_years")
    .select("year")
    .eq("is_current", true)
    .single();

  if (!fy) return { error: "現在の会計年度が設定されていません" };

  const { error } = await auth.supabase.from("subsidy_items").insert({
    category: values.category,
    term: values.term,
    expense_type: values.expense_type,
    income_type: values.income_type as string | undefined,
    date: format(values.date, "yyyy-MM-dd"),
    accounting_group_id: values.accounting_group_id,
    applicant_id: auth.profileId,
    fiscal_year_id: fy.year,
    name: values.name,
    requested_amount: values.requested_amount,
    justification: values.justification,
    evidence_url: values.evidence_url,
    status: "pending",
  });

  if (error) {
    console.error("Subsidy insert error:", error);
    return { error: "支援金申請の登録に失敗しました" };
  }

  revalidatePath("/subsidies");
  revalidatePath("/");
  return { success: true };
}

export async function fetchMySubsidyItems() {
  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;

  const { data, error } = await auth.supabase
    .from("subsidy_items")
    .select(
      "id, category, term, expense_type, name, requested_amount, approved_amount, status, justification, evidence_url, receipt_url, created_at, accounting_group_id, accounting_groups(name)",
    )
    .eq("applicant_id", auth.profileId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Fetch subsidy items error:", error);
    return { error: "支援金申請の取得に失敗しました" };
  }

  return { data: data || [] };
}

export async function fetchPendingSubsidyItems() {
  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { data: [] };
  const auth = authResult.context;

  const { data, error } = await auth.supabase
    .from("subsidy_items")
    .select(
      "id, category, term, expense_type, name, requested_amount, status, accounting_groups(name)",
    )
    .eq("applicant_id", auth.profileId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  return { data: data || [] };
}

export async function updateMySubsidyItem(
  id: string,
  values: {
    category?: string;
    term?: number;
    expense_type?: string;
    income_type?: string;
    date?: Date;
    accounting_group_id?: string;
    name?: string;
    requested_amount?: number;
    justification?: string;
    receipt_url?: string | null;
  },
) {
  const inputValidation = validateInput(updateMySubsidyItemSchema, {
    id,
    values,
  });
  if (!inputValidation.success) {
    return { error: "入力データが不正です" };
  }

  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;

  // Ensure the user actually owns this subsidy item and it is currently 'pending'
  const { data: item, error: fetchError } = await auth.supabase
    .from("subsidy_items")
    .select("status, applicant_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !item) {
    return { error: "支援金申請情報の取得に失敗しました" };
  }

  if (item.applicant_id !== auth.profileId) {
    return { error: "他人の申請は編集できません" };
  }

  if (item.status !== "pending") {
    return { error: "受付中以外の申請は編集できません" };
  }

  const updateData: Record<string, unknown> = { ...values };
  if (values.date) {
    updateData.date = format(values.date, "yyyy-MM-dd");
  }

  const { error: updateError } = await auth.supabase
    .from("subsidy_items")
    .update(updateData)
    .eq("id", id);

  if (updateError) {
    console.error("updateMySubsidyItem error:", updateError);
    return { error: "申請情報の更新に失敗しました" };
  }

  revalidatePath("/subsidies");
  return { success: true };
}

export async function deleteMySubsidyItem(id: string) {
  const inputValidation = validateInput(deleteSubsidyItemSchema, { id });
  if (!inputValidation.success) {
    return { error: "入力データが不正です" };
  }

  const authResult = await resolveAuthContext();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;

  // Check if user is global admin
  const access = await getUserRoleAccess(auth);

  // Fetch the item to verify ownership and status
  const { data: item, error: fetchError } = await auth.supabase
    .from("subsidy_items")
    .select("status, applicant_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !item) {
    return { error: "支援金申請情報の取得に失敗しました" };
  }

  // Only the owner or a global admin can delete
  if (item.applicant_id !== auth.profileId && !access.isAdmin) {
    return { error: "他人の申請は削除できません" };
  }

  // Only pending items can be deleted (unless global admin)
  if (item.status !== "pending" && !access.isAdmin) {
    return { error: "受付中以外の申請は削除できません" };
  }

  // Soft delete: set deleted_at
  const deletedAt = new Date().toISOString();
  const { error } = await auth.supabase
    .from("subsidy_items")
    .update({ deleted_at: deletedAt })
    .eq("id", id);

  if (error) {
    console.error("deleteMySubsidyItem error:", JSON.stringify(error, null, 2));
    return { error: "申請の削除に失敗しました" };
  }

  revalidatePath("/subsidies");
  revalidatePath("/");
  return { success: true };
}
