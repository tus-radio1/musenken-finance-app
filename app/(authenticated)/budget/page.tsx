import { createClient } from "@/utils/supabase/server";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BudgetUpdateDialog } from "./_components/budget-update-dialog";
import { NewFiscalYearDialog } from "./_components/new-fiscal-year-dialog";
import { ToggleGroupActiveDialog } from "./_components/toggle-group-active-dialog";
import { AddGroupDialog } from "./_components/add-group-dialog";
import { DeleteGroupYearButton } from "./_components/delete-group-year-button";
import { requireRoleAccess } from "@/lib/roles/access";
import {
  canEditBudget,
  canCreateFiscalYear,
  canManageGroups,
  canViewBudgetPage,
  isAdmin,
} from "@/lib/roles/permissions";
import { getAccountingGroups, getFiscalYears } from "@/lib/cache";
import { formatCurrency } from "@/lib/format";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { AccessDenied } from "@/components/feedback/access-denied";
import { FiscalYearSelector } from "@/components/fiscal-year-selector";

const BudgetOverview = dynamic(
  () =>
    import("@/components/budget-overview").then((mod) => ({
      default: mod.BudgetOverview,
    })),
  {
    loading: () => (
      <div className="h-48 flex items-center justify-center text-muted-foreground">
        Loading chart...
      </div>
    ),
  },
);

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  // Step 1: auth + fiscalYears are independent — run in parallel
  const [{ data: { user } }, fiscalYears] =
    await Promise.all([
      supabase.auth.getUser(),
      getFiscalYears(),
    ]);

  if (!user) {
    redirect("/login");
  }

  // 選択された年度、またはデフォルトで現在の年度
  const selectedYearParam = params.year;
  let fyYear: number | undefined;

  if (selectedYearParam) {
    fyYear = parseInt(selectedYearParam, 10);
  } else {
    const currentFY = fiscalYears?.find((fy) => fy.is_current);
    fyYear = currentFY?.year ?? undefined;
    if (!fyYear && fiscalYears && fiscalYears.length > 0) {
      fyYear = fiscalYears[0]?.year ?? undefined;
    }
  }

  // Step 2: roles + categories + budgets + RPC — all depend on user.id or fyYear, run in parallel
  let budgetQuery = supabase
    .from("budgets")
    .select("id, accounting_group_id, amount, carryover_amount, fiscal_year_id");
  if (typeof fyYear !== "undefined") {
    budgetQuery = budgetQuery.eq("fiscal_year_id", fyYear);
  }

  type BudgetUsageRow = { accounting_group_id: string; expenses: number; pending: number; income: number };

  const [
    access,
    categories,
    { data: budgets, error: budgetsError },
    { data: usageRows, error: usageError },
  ] = await Promise.all([
    requireRoleAccess({ supabase, profileId: user.id }),
    getAccountingGroups(),
    budgetQuery,
    fyYear
      ? supabase.rpc("get_budget_usage", { p_fiscal_year_id: fyYear })
      : Promise.resolve({ data: [] as BudgetUsageRow[], error: null }),
  ]);

  const isGlobalAdmin = isAdmin(access);

  // 会計ロールを持たないユーザーはアクセス不可
  if (!canViewBudgetPage(access)) {
    return (
      <PageShell>
        <PageHeader title="予算管理" />
        <AccessDenied description="このページは会計またはAdmin権限を持つユーザーのみアクセスできます。" />
      </PageShell>
    );
  }

  if (budgetsError) {
    console.error("budgets取得エラー:", budgetsError);
  }

  if (usageError) {
    console.error("get_budget_usage RPCエラー:", usageError);
  }

  type AccountingGroupCached = { id: string; name: string; is_active: boolean; type: string | null };
  const typedCategories = (categories || []) as AccountingGroupCached[];

  const usageMap: Record<string, { expenses: number; pending: number; income: number }> = {};
  (usageRows || []).forEach((row) => {
    usageMap[row.accounting_group_id] = {
      expenses: Number(row.expenses),
      pending: Number(row.pending),
      income: Number(row.income),
    };
  });

  const budgetStatus = (budgets || []).map((b) => {
    const group = typedCategories.find(
      (c) => c.id === b.accounting_group_id,
    );
    return {
      budget_id: b.id,
      category_id: b.accounting_group_id,
      category_name: group?.name || "",
      budget_amount: Number(b.amount) || 0,
      carryover_amount: Number(b.carryover_amount) || 0,
      expenses: usageMap[b.accounting_group_id]?.expenses || 0,
      pending: usageMap[b.accounting_group_id]?.pending || 0,
      income: usageMap[b.accounting_group_id]?.income || 0,
    };
  });

  // Active accounting groups only (inactive groups are excluded from the table)
  const allGroupsWithBudget = typedCategories.filter((c) => c.is_active !== false).map((c) => {
    const budget = (budgets || []).find(
      (b) => b.accounting_group_id === c.id,
    );
    return {
      group_id: c.id,
      group_name: c.name,
      is_active: c.is_active ?? true,
      budget_amount: budget ? Number(budget.amount) : 0,
      carryover_amount: budget ? Number(budget.carryover_amount) : 0,
      expenses: usageMap[c.id]?.expenses || 0,
      pending: usageMap[c.id]?.pending || 0,
      income: usageMap[c.id]?.income || 0,
    };
  });

  // Data for dialogs
  const groupsForDialog = typedCategories.map((c) => {
    const budget = (budgets || []).find(
      (b) => b.accounting_group_id === c.id,
    );
    return {
      id: c.id,
      name: c.name,
      isActive: c.is_active ?? true,
      currentBudget: budget ? Number(budget.amount) : 0,
      currentCarryover: budget ? Number(budget.carryover_amount) : 0,
    };
  });
  const existingYears = (fiscalYears || []).map((fy) => fy.year);
  const isCurrentFY =
    fiscalYears?.find((fy) => fy.year === fyYear)?.is_current ?? false;
  // サーバー側（upsertBudget）と同じ判定: 管理者は常に、会計は現在の年度のみ
  const canEdit = canEditBudget(access, { isCurrent: isCurrentFY });

  return (
    <PageShell>
      <PageHeader
        title="予算管理"
        actions={
          <FiscalYearSelector
            fiscalYears={(fiscalYears || []).map((fy) => ({ ...fy, is_current: fy.is_current ?? false }))}
            selectedYear={fyYear}
            basePath="/budget"
          />
        }
      />

        {!isCurrentFY && !isGlobalAdmin && (
          <div className="rounded-md border border-warning/50 bg-warning px-4 py-3 text-sm text-warning-foreground">
            過年度データのため閲覧専用です
          </div>
        )}

        <BudgetOverview data={budgetStatus} />

        <Card>
          <CardHeader>
            <CardTitle>会計グループ別予算一覧</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>会計グループ</TableHead>
                  <TableHead className="text-right">予算額</TableHead>
                  <TableHead className="text-right">繰入金</TableHead>
                  <TableHead className="text-right">収入合計</TableHead>
                  <TableHead className="text-right">支出額</TableHead>
                  <TableHead className="text-right">申請中</TableHead>
                  <TableHead className="text-right">残額</TableHead>
                  <TableHead className="text-right">使用率</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {allGroupsWithBudget.map((item) => {
                  const effectiveBudget = item.budget_amount + item.carryover_amount;
                  const totalUsed = item.expenses + item.pending;
                  const remaining = effectiveBudget + item.income - totalUsed;
                  const usageRate =
                    effectiveBudget + item.income > 0
                      ? (totalUsed / (effectiveBudget + item.income)) * 100
                      : 0;
                  return (
                    <TableRow key={item.group_id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {item.group_name}
                          {!item.is_active && (
                            <Badge variant="outline">無効</Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.budget_amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.carryover_amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.income)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.expenses)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.pending)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(remaining)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`${
                            usageRate > 90
                              ? "text-danger-foreground font-semibold"
                              : usageRate > 75
                                ? "text-warning-foreground"
                                : "text-success-foreground"
                          }`}
                        >
                          {usageRate.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        {canManageGroups(access) && canEdit && !item.is_active && fyYear && (
                          <DeleteGroupYearButton
                            groupId={item.group_id}
                            groupName={item.group_name}
                            fiscalYear={fyYear}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {fyYear && (
          <div className="flex flex-wrap gap-3">
            {canEdit && (
              <BudgetUpdateDialog
                groups={groupsForDialog}
                fiscalYear={fyYear}
              />
            )}
            {canCreateFiscalYear(access) && (
              <NewFiscalYearDialog
                groups={groupsForDialog.map((g) => ({
                  id: g.id,
                  name: g.name,
                }))}
                existingYears={existingYears}
              />
            )}
            {canManageGroups(access) && (
              <>
                {canEdit && <AddGroupDialog fiscalYear={fyYear} />}
                <ToggleGroupActiveDialog
                  groups={groupsForDialog.map((g) => ({
                    id: g.id,
                    name: g.name,
                    isActive: g.isActive,
                  }))}
                />
              </>
            )}
          </div>
        )}
    </PageShell>
  );
}
