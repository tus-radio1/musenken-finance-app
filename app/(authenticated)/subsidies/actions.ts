"use server";

/**
 * 支援金申請の Server Actions。
 *
 * 権限モデル:
 *   - createSubsidyItem: ログイン済みユーザー（status は常に "pending" で開始）
 *   - updateMySubsidyItem: 申請者本人のみ。pending → 全フィールド編集可、
 *     approved → receipt_url のみ変更可（領収書提出用）
 *   - deleteMySubsidyItem: 申請者本人は pending のみ削除可。管理者は全ステータス削除可
 *   - fetchMySubsidyItems / fetchPendingSubsidyItems: 自分の申請のみ取得
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { subsidyFormSchema } from "@/lib/schema";
import { resolveAuthContext, resolveAuthWithRoles } from "@/lib/auth/context";
import { createAdminClient } from "@/utils/supabase/server";
import { formatDateForDatabase } from "@/lib/date";
import {
  updateMySubsidyItemSchema,
  deleteSubsidyItemSchema,
  validateInput,
} from "@/lib/validations";

const createSubsidyItemServerSchema = subsidyFormSchema.extend({
  evidence_url: z
    .string({ required_error: "根拠書類をアップロードしてください" })
    .trim()
    .min(1, "根拠書類をアップロードしてください"),
});

export async function createSubsidyItem(
  values: z.infer<typeof subsidyFormSchema>,
) {
  const inputValidation = validateInput(createSubsidyItemServerSchema, values);
  if (!inputValidation.success) {
    return { error: inputValidation.error };
  }

  const validatedValues = inputValidation.data;

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
    category: validatedValues.category,
    term: validatedValues.term,
    expense_type: validatedValues.expense_type,
    income_type: validatedValues.income_type as string | undefined,
    date: formatDateForDatabase(validatedValues.date),
    accounting_group_id: validatedValues.accounting_group_id,
    applicant_id: auth.profileId,
    fiscal_year_id: fy.year,
    name: validatedValues.name,
    requested_amount: validatedValues.requested_amount,
    justification: validatedValues.justification,
    usage_period: validatedValues.usage_period || null,
    remarks: validatedValues.remarks || null,
    evidence_url: validatedValues.evidence_url,
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
      "id, category, term, expense_type, name, requested_amount, approved_amount, status, justification, usage_period, evidence_url, receipt_url, created_at, accounting_group_id, accounting_groups(name)",
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

  const { data } = await auth.supabase
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
    usage_period?: string;
    remarks?: string | null;
    receipt_url?: string | null;
    evidence_url?: string | null;
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

  if (item.status !== "pending" && item.status !== "approved") {
    return { error: "受付中または審査通過の申請のみ編集できます" };
  }

  let updateData: Record<string, unknown>;
  if (item.status === "approved") {
    // approved: receipt_url only
    updateData = {};
    if (values.receipt_url !== undefined) {
      updateData.receipt_url = values.receipt_url;
    }
  } else {
    // pending: general fields + evidence_url (receipt_url is not allowed)
    // receipt_url は pending 時に更新不可のため分割代入で除外
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { receipt_url: _receipt_url, ...rest } = values;
    updateData = { ...rest };
    if (values.date) {
      updateData.date = formatDateForDatabase(values.date);
    }
  }

  // Use admin client to bypass RLS for the update.
  // Ownership and status are already validated above with the user's client.
  const supabaseAdmin = createAdminClient();
  const { error: updateError } = await supabaseAdmin
    .from("subsidy_items")
    .update(updateData)
    .eq("id", id)
    .eq("applicant_id", auth.profileId);

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

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;
  const access = authResult.access;

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

  // Delete behavior:
  // - Admins perform a soft delete by setting deleted_at (not restricted by RLS).
  // - Non-admin users perform a hard delete, avoiding the RLS check on deleted_at.
  let dbError;
  if (access.isAdmin) {
    const deletedAt = new Date().toISOString();
    const { error } = await auth.supabase
      .from("subsidy_items")
      .update({ deleted_at: deletedAt })
      .eq("id", id);
    dbError = error;
  } else {
    const { error } = await auth.supabase
      .from("subsidy_items")
      .delete()
      .eq("id", id);
    dbError = error;
  }

  if (dbError) {
    console.error(
      "deleteMySubsidyItem error:",
      JSON.stringify(dbError, null, 2),
    );
    return { error: "申請の削除に失敗しました" };
  }

  revalidatePath("/subsidies");
  revalidatePath("/");
  return { success: true };
}
