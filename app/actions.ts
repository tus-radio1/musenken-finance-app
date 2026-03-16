"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/utils/supabase/server";
import { z } from "zod";
import { formSchema } from "@/lib/schema";
import {
  extractStudentNumberFromUser,
  findProfileIdByStudentNumber,
} from "@/lib/account";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function uploadReceiptAction(formData: FormData) {
  const file = formData.get("file") as File;
  const fileName = formData.get("fileName") as string;

  if (!file || !fileName) {
    return { error: "File and fileName are required" };
  }

  const supabaseAdmin = createAdminClient();

  // upsert configuration is used in case a user updates the receipt for the same transaction
  const { error } = await supabaseAdmin.storage
    .from("receipts")
    .upload(fileName, file, { upsert: true });

  if (error) {
    console.error("Storage upload error:", error);
    return { error: "アップロードに失敗しました" };
  }

  return { success: true, filePath: fileName };
}

export async function updateTransactionStatus(
  transactionId: string,
  status: "approved" | "rejected",
  reason?: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  if (!profileId) return { error: "Unauthorized" };

  // 取引の情報（会計グループと作成者）を取得
  const { data: transaction } = await supabase
    .from("transactions")
    .select("accounting_group_id, created_by")
    .eq("id", transactionId)
    .single();

  if (!transaction) return { error: "Data not found" };

  // ユーザーのロールを取得（roles とのリレーション）
  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("role_id, roles(type, accounting_group_id)")
    .eq("user_id", profileId);

  const roles = (userRoles || []).map((ur: any) => ur.roles).filter(Boolean);
  const isGlobalAdmin = roles.some((r: any) => r.type === "admin");
  const isGroupLeader = roles.some(
    (r: any) =>
      r.type === "leader" &&
      r.accounting_group_id === transaction.accounting_group_id,
  );

  if (!isGlobalAdmin && !isGroupLeader) {
    return { error: "承認権限がありません" };
  }

  if (transaction.created_by === profileId) {
    return { error: "自分の申請を承認することはできません" };
  }

  const { error } = await supabase
    .from("transactions")
    .update({
      approval_status: status,
      approved_by: profileId,
      approved_at: new Date().toISOString(),
      rejected_reason: reason || null,
    })
    .eq("id", transactionId);

  if (error) {
    console.error(error);
    return { error: "ステータス更新に失敗しました" };
  }

  revalidatePath("/ledger");
  return { success: true };
}

export async function updateTransaction(
  id: string,
  values: z.infer<typeof formSchema> & { receipt_url?: string | null },
) {
  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  if (!profileId) return { error: "Unauthorized" };

  // 取引情報取得
  const { data: transaction } = await supabaseAdmin
    .from("transactions")
    .select("accounting_group_id, created_by, approval_status, amount")
    .eq("id", id)
    .single();

  if (!transaction) return { error: "Data not found" };

  // ロールやユーザ情報のチェック
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", profileId)
    .maybeSingle();

  const { data: userRoles } = await supabaseAdmin
    .from("user_roles")
    .select("roles(name, type, accounting_group_id)")
    .eq("user_id", profileId);

  const roles = (userRoles || []).map((ur: any) => ur.roles).filter(Boolean);
  const isGlobalAdmin = roles.some((r: any) => r.type === "admin");
  const isAccountingUser =
    profile?.role === "accounting" || roles.some((r: any) => r.name === "会計");
  const isGroupLeader = roles.some(
    (r: any) =>
      r.type === "leader" &&
      r.accounting_group_id === transaction.accounting_group_id,
  );

  const canEdit =
    transaction.created_by === profileId ||
    isGlobalAdmin ||
    isAccountingUser ||
    isGroupLeader;

  if (!canEdit) {
    return { error: "更新できませんでした（権限がない可能性があります）" };
  }

  // 一般ユーザーは「受付中」のみ編集可能
  const isGeneralUserOnly =
    !isGlobalAdmin && !isAccountingUser && !isGroupLeader;
  if (isGeneralUserOnly && transaction.approval_status !== "pending") {
    return { error: "受付中以外のデータは編集できません" };
  }

  // 現在の会計年度を取得
  const { data: fy } = await supabaseAdmin
    .from("fiscal_years")
    .select("year")
    .eq("is_current", true)
    .single();

  // 値の更新 (一般ユーザ/会計は、日付と会計グループの変更を無視)
  const isEditing = true; // updateTransaction なので常にtrue

  // Admin だけでなく、編集権限を持つ人全員が type, date, accounting_groupなどを変更できるようにする
  const effectiveType = values.type;
  const finalAmount =
    effectiveType === "expense"
      ? -Math.abs(values.amount)
      : Math.abs(values.amount);

  // toISOString() は UTC 変換するため日付がズレる。ローカル日付の YYYY-MM-DD を使用。
  const dateObj = new Date(values.date);
  const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;

  const updates: any = {
    amount: finalAmount,
    description: values.description,
    fiscal_year_id: fy?.year ?? null,
    date: dateStr,
    accounting_group_id: values.accounting_group_id,
  };

  if (values.receipt_url !== undefined) {
    updates.receipt_url = values.receipt_url;
  }

  if (values.remarks !== undefined) {
    updates.remarks = values.remarks;
  }

  if (values.created_by !== undefined && isGlobalAdmin) {
    updates.created_by = values.created_by;
  }

  if (values.approved_by !== undefined && isGlobalAdmin) {
    updates.approved_by =
      values.approved_by === "clear" ? null : values.approved_by;
  }

  if (
    values.approval_status !== undefined &&
    (isGlobalAdmin || isAccountingUser)
  ) {
    updates.approval_status = values.approval_status;
  }

  const { error } = await supabaseAdmin
    .from("transactions")
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error(error);
    return { error: "更新に失敗しました（データベースエラー）" };
  }

  revalidatePath("/ledger");
  return { success: true };
}

export async function deleteTransaction(id: string) {
  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  if (!profileId) return { error: "Unauthorized" };

  // 取引情報取得
  const { data: transaction } = await supabaseAdmin
    .from("transactions")
    .select("created_by, approval_status")
    .eq("id", id)
    .single();

  if (!transaction) return { error: "Data not found" };

  // ロールやユーザ情報のチェック
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", profileId)
    .maybeSingle();

  const { data: userRoles } = await supabaseAdmin
    .from("user_roles")
    .select("roles(name, type)")
    .eq("user_id", profileId);

  const roles = (userRoles || []).map((ur: any) => ur.roles).filter(Boolean);
  const isGlobalAdmin = roles.some((r: any) => r.type === "admin");
  const isAccountingUser =
    profile?.role === "accounting" || roles.some((r: any) => r.name === "会計");

  // Admin のみ削除可能
  if (!isGlobalAdmin) {
    return { error: "削除する権限がありません。" };
  }

  const { error } = await supabaseAdmin
    .from("transactions")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(error);
    return { error: "削除できませんでした（データベースエラー）" };
  }

  revalidatePath("/ledger");
  return { success: true };
}
