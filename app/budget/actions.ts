"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import {
  extractStudentNumberFromUser,
  findProfileIdByStudentNumber,
} from "@/lib/account";

export async function upsertBudget(
  accountingGroupId: string,
  amount: number,
  fiscalYear?: number,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  if (!profileId) return { error: "Unauthorized" };

  // 役割確認（グローバル管理者 or 当該グループのリーダーのみ編集可）
  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("roles(type, accounting_group_id)")
    .eq("user_id", profileId);
  const roles = (userRoles || []).map((ur: any) => ur.roles).filter(Boolean);
  const isGlobalAdmin = roles.some((r: any) => r.type === "admin");
  const isGroupLeader = roles.some(
    (r: any) =>
      r.type === "leader" && r.accounting_group_id === accountingGroupId,
  );

  if (!isGlobalAdmin && !isGroupLeader) {
    return { error: "予算の編集権限がありません" };
  }

  // 会計年度を取得（引数で指定されていればそれを使用、なければ現在の年度）
  let fiscalYearId: number | null = null;
  if (fiscalYear) {
    fiscalYearId = fiscalYear;
  } else {
    const { data: fy } = await supabase
      .from("fiscal_years")
      .select("year")
      .eq("is_current", true)
      .single();
    fiscalYearId = fy?.year ?? null;
  }

  if (!fiscalYearId) {
    return { error: "会計年度が未設定です" };
  }

  // 既存レコード確認
  const { data: existing } = await supabase
    .from("budgets")
    .select("id")
    .eq("accounting_group_id", accountingGroupId)
    .eq("fiscal_year_id", fiscalYearId)
    .limit(1)
    .maybeSingle();

  let error = null as any;
  if (existing?.id) {
    const res = await supabase
      .from("budgets")
      .update({ amount })
      .eq("id", existing.id);
    error = res.error;
  } else {
    const res = await supabase.from("budgets").insert({
      accounting_group_id: accountingGroupId,
      amount,
      fiscal_year_id: fiscalYearId,
    });
    error = res.error;
  }

  if (error) {
    console.error(error);
    return { error: "予算の保存に失敗しました" };
  }

  revalidatePath("/budget");
  return { success: true };
}

export async function createFiscalYearBudgets(
  year: number,
  budgets: { groupId: string; amount: number }[],
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  if (!profileId) return { error: "Unauthorized" };

  // 役割確認（グローバル管理者 or 会計ロールのみ）
  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("roles(name, type)")
    .eq("user_id", profileId);
  const roles = (userRoles || []).map((ur: any) => ur.roles).filter(Boolean);
  const isGlobalAdmin = roles.some((r: any) => r.type === "admin");
  const hasAccountingRole = roles.some((r: any) => r.name === "会計");

  if (!isGlobalAdmin && !hasAccountingRole) {
    return { error: "新規年度を作成する権限がありません" };
  }

  // 年度の重複チェック
  const { data: existing } = await supabase
    .from("fiscal_years")
    .select("year")
    .eq("year", year)
    .maybeSingle();

  if (existing) {
    return { error: `${year}年度は既に存在します` };
  }

  // 年度作成
  const { error: fyError } = await supabase
    .from("fiscal_years")
    .insert({ year, is_current: false });

  if (fyError) {
    console.error(fyError);
    return { error: "年度の作成に失敗しました" };
  }

  // 予算一括挿入（金額が0より大きいもののみ）
  const rows = budgets
    .filter((b) => b.amount > 0)
    .map((b) => ({
      accounting_group_id: b.groupId,
      amount: b.amount,
      fiscal_year_id: year,
    }));

  if (rows.length > 0) {
    const { error: budgetError } = await supabase.from("budgets").insert(rows);

    if (budgetError) {
      console.error(budgetError);
      return { error: "予算の保存に失敗しました" };
    }
  }

  revalidatePath("/budget");
  return { success: true };
}
