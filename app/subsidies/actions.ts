"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { z } from "zod";
import { format } from "date-fns";
import { subsidyFormSchema } from "@/lib/schema";
import {
  extractStudentNumberFromUser,
  findProfileIdByStudentNumber,
} from "@/lib/account";
import {
  updateMySubsidyItemSchema,
  validateInput,
} from "@/lib/validations";

export async function createSubsidyItem(
  values: z.infer<typeof subsidyFormSchema>,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインしてください" };

  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  if (!profileId) return { error: "プロファイルが見つかりません" };

  // 現在の会計年度を取得
  const { data: fy } = await supabase
    .from("fiscal_years")
    .select("year")
    .eq("is_current", true)
    .single();

  if (!fy) return { error: "現在の会計年度が設定されていません" };

  const { error } = await supabase.from("subsidy_items").insert({
    category: values.category,
    term: values.term,
    expense_type: values.expense_type,
    income_type: values.income_type as string | undefined,
    date: format(values.date, "yyyy-MM-dd"),
    accounting_group_id: values.accounting_group_id,
    applicant_id: profileId,
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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインしてください" };

  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  if (!profileId) return { error: "プロファイルが見つかりません" };

  const { data, error } = await supabase
    .from("subsidy_items")
    .select(
      "id, category, term, expense_type, name, requested_amount, approved_amount, status, justification, evidence_url, receipt_url, created_at, accounting_group_id, accounting_groups(name)",
    )
    .eq("applicant_id", profileId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Fetch subsidy items error:", error);
    return { error: "支援金申請の取得に失敗しました" };
  }

  return { data: data || [] };
}

export async function fetchPendingSubsidyItems() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: [] };

  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  if (!profileId) return { data: [] };

  const { data, error } = await supabase
    .from("subsidy_items")
    .select(
      "id, category, term, expense_type, name, requested_amount, status, accounting_groups(name)",
    )
    .eq("applicant_id", profileId)
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

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "認証が必要です" };
  }

  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);

  if (!profileId) {
    return { error: "プロファイルが見つかりません" };
  }

  // Ensure the user actually owns this subsidy item and it is currently 'pending'
  const { data: item, error: fetchError } = await supabase
    .from("subsidy_items")
    .select("status, applicant_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !item) {
    return { error: "支援金申請情報の取得に失敗しました" };
  }

  if (item.applicant_id !== profileId) {
    return { error: "他人の申請は編集できません" };
  }

  if (item.status !== "pending") {
    return { error: "受付中以外の申請は編集できません" };
  }

  const updateData: Record<string, unknown> = { ...values };
  if (values.date) {
    updateData.date = format(values.date, "yyyy-MM-dd");
  }

  const { error: updateError } = await supabase
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
