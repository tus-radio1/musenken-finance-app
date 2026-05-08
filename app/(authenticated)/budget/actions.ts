"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/server";
import {
  upsertBudgetSchema,
  createFiscalYearBudgetsSchema,
  toggleAccountingGroupActiveSchema,
  deleteGroupYearDataSchema,
  validateInput,
} from "@/lib/validations";
import { resolveAuthWithRoles } from "@/lib/auth/context";
import { canManageBudget } from "@/lib/roles/access";

export async function upsertBudget(
  accountingGroupId: string,
  amount: number,
  fiscalYear?: number,
  carryoverAmount?: number,
) {
  const validation = validateInput(upsertBudgetSchema, {
    accountingGroupId,
    amount,
    carryoverAmount: carryoverAmount ?? 0,
    fiscalYear,
  });
  if (!validation.success) {
    return { error: "入力データが不正です" };
  }

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;
  const access = authResult.access;

  // 役割確認（グローバル管理者 or 当該グループのリーダーのみ編集可）
  if (!canManageBudget(access, accountingGroupId)) {
    return { error: "予算の編集権限がありません" };
  }

  // 会計年度を取得（引数で指定されていればそれを使用、なければ現在の年度）
  let fiscalYearId: number | null = null;
  if (fiscalYear) {
    fiscalYearId = fiscalYear;
  } else {
    const { data: fy } = await auth.supabase
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
  const { data: existing } = await auth.supabase
    .from("budgets")
    .select("id")
    .eq("accounting_group_id", accountingGroupId)
    .eq("fiscal_year_id", fiscalYearId)
    .limit(1)
    .maybeSingle();

  // createAdminClient needed to bypass RLS for budget writes (no RLS write policy for budgets table)
  const adminDb = createAdminClient();
  let dbError: { message: string; code?: string } | null = null;
  if (existing?.id) {
    const res = await adminDb
      .from("budgets")
      .update({ amount, carryover_amount: carryoverAmount ?? 0 })
      .eq("id", existing.id);
    dbError = res.error;
  } else {
    const res = await adminDb.from("budgets").insert({
      accounting_group_id: accountingGroupId,
      amount,
      carryover_amount: carryoverAmount ?? 0,
      fiscal_year_id: fiscalYearId,
    });
    dbError = res.error;
  }

  if (dbError) {
    console.error("[upsertBudget] DB error:", dbError);
    return { error: "予算の保存に失敗しました" };
  }

  revalidatePath("/budget");
  return { success: true };
}

export async function createFiscalYearBudgets(
  year: number,
  budgets: { groupId: string; amount: number; carryoverAmount?: number }[],
) {
  const validation = validateInput(createFiscalYearBudgetsSchema, {
    year,
    budgets,
  });
  if (!validation.success) {
    return { error: "入力データが不正です" };
  }

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const auth = authResult.context;
  const access = authResult.access;

  // 役割確認（グローバル管理者 or 会計ロールのみ）
  if (!access.isAdmin && !access.hasAccountingRole) {
    return { error: "新規年度を作成する権限がありません" };
  }

  // 年度の重複チェック
  const { data: existing } = await auth.supabase
    .from("fiscal_years")
    .select("year")
    .eq("year", year)
    .maybeSingle();

  if (existing) {
    return { error: `${year}年度は既に存在します` };
  }

  // 年度作成 - createAdminClient needed to bypass RLS for fiscal_years/budgets writes
  const adminDb = createAdminClient();
  const { error: fyError } = await adminDb.from("fiscal_years").insert({
    year,
    start_date: `${year}-04-01`,
    end_date: `${year + 1}-03-31`,
    is_current: false,
  });

  if (fyError) {
    console.error(fyError);
    return { error: "年度の作成に失敗しました" };
  }

  // Bulk insert budgets (only those with amount > 0 or carryover > 0)
  const rows = budgets
    .filter((b) => b.amount > 0 || (b.carryoverAmount ?? 0) > 0)
    .map((b) => ({
      accounting_group_id: b.groupId,
      amount: b.amount,
      carryover_amount: b.carryoverAmount ?? 0,
      fiscal_year_id: year,
    }));

  if (rows.length > 0) {
    const { error: budgetError } = await adminDb.from("budgets").insert(rows);

    if (budgetError) {
      console.error(budgetError);
      return { error: "予算の保存に失敗しました" };
    }
  }

  revalidatePath("/budget");
  return { success: true };
}

export async function toggleAccountingGroupActive(
  groupId: string,
  isActive: boolean,
) {
  const validation = validateInput(toggleAccountingGroupActiveSchema, {
    groupId,
    isActive,
  });
  if (!validation.success) {
    return { error: "入力データが不正です" };
  }

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const access = authResult.access;

  // Only global admins can toggle group active status
  if (!access.isAdmin) {
    return { error: "グループの有効/無効を切り替える権限がありません" };
  }

  const adminDb = createAdminClient();
  const { error: dbError } = await adminDb
    .from("accounting_groups")
    .update({ is_active: isActive })
    .eq("id", groupId);

  if (dbError) {
    console.error("[toggleAccountingGroupActive] DB error:", dbError);
    return { error: "グループの状態更新に失敗しました" };
  }

  updateTag("accounting_groups");
  revalidatePath("/budget");
  return { success: true };
}

export async function deleteGroupYearData(
  groupId: string,
  fiscalYear: number,
) {
  const validation = validateInput(deleteGroupYearDataSchema, {
    groupId,
    fiscalYear,
  });
  if (!validation.success) {
    return { error: "入力データが不正です" };
  }

  const authResult = await resolveAuthWithRoles();
  if (!authResult.ok) return { error: authResult.error };
  const access = authResult.access;

  // Only global admins can delete group year data
  if (!access.isAdmin) {
    return { error: "データを削除する権限がありません" };
  }

  const adminDb = createAdminClient();

  // Delete transactions first (referential integrity)
  const { error: txError } = await adminDb
    .from("transactions")
    .delete()
    .eq("accounting_group_id", groupId)
    .eq("fiscal_year_id", fiscalYear);

  if (txError) {
    console.error("[deleteGroupYearData] transactions delete error:", txError);
    return { error: "出納帳データの削除に失敗しました" };
  }

  // Delete budget record
  const { error: budgetError } = await adminDb
    .from("budgets")
    .delete()
    .eq("accounting_group_id", groupId)
    .eq("fiscal_year_id", fiscalYear);

  if (budgetError) {
    console.error("[deleteGroupYearData] budgets delete error:", budgetError);
    return { error: "予算データの削除に失敗しました" };
  }

  revalidatePath("/budget");
  return { success: true };
}
