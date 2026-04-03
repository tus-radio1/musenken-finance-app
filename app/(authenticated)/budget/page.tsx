import { createClient } from "@/utils/supabase/server";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { YearSelector } from "./_components/year-selector";
import { BudgetUpdateDialog } from "./_components/budget-update-dialog";
import { NewFiscalYearDialog } from "./_components/new-fiscal-year-dialog";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { ROLE_TYPES, ROLE_NAMES_JA } from "@/lib/roles/constants";

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

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  // Step 1: auth + fiscalYears are independent — run in parallel
  const [{ data: { user } }, { data: fiscalYears, error: fiscalYearsError }] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("fiscal_years")
        .select("year, is_current")
        .order("year", { ascending: false }),
    ]);

  if (!user) {
    redirect("/login");
  }

  if (fiscalYearsError) {
    console.error("fiscal_years取得エラー:", fiscalYearsError);
  }

  // 選択された年度、またはデフォルトで現在の年度
  const selectedYearParam = params.year;
  let fyYear: number | undefined;

  if (selectedYearParam) {
    fyYear = parseInt(selectedYearParam, 10);
  } else {
    const currentFY = fiscalYears?.find((fy: any) => fy.is_current);
    fyYear = currentFY?.year ?? undefined;
    if (!fyYear && fiscalYears && fiscalYears.length > 0) {
      fyYear = fiscalYears[0]?.year ?? undefined;
    }
  }

  // Step 2: userRoles + categories + budgets + RPC — all depend on user.id or fyYear, run in parallel
  let budgetQuery = supabase
    .from("budgets")
    .select("id, accounting_group_id, amount, fiscal_year_id");
  if (typeof fyYear !== "undefined") {
    budgetQuery = budgetQuery.eq("fiscal_year_id", fyYear);
  }

  const [
    { data: userRoles },
    { data: categories },
    { data: budgets, error: budgetsError },
    { data: usageRows, error: usageError },
  ] = await Promise.all([
    supabase
      .from("user_roles")
      .select("roles(name, type, accounting_group_id)")
      .eq("user_id", user.id),
    supabase.from("accounting_groups").select("id, name").order("name"),
    budgetQuery,
    fyYear
      ? supabase.rpc("get_budget_usage", { p_fiscal_year_id: fyYear })
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  // ロール情報取得
  let isGlobalAdmin = false;
  let hasAccountingRole = false;
  const myGroupRoles: Record<string, string> = {};
  const roles = (userRoles || []).map((ur: any) => ur.roles).filter(Boolean);
  isGlobalAdmin = roles.some((r: any) => r.type === ROLE_TYPES.ADMIN);
  hasAccountingRole = roles.some(
    (r: any) => r.name === ROLE_NAMES_JA.ACCOUNTING,
  );
  roles.forEach((r: any) => {
    if (r?.accounting_group_id && r?.type) {
      myGroupRoles[r.accounting_group_id] = r.type;
    }
  });

  // 会計ロールを持たないユーザーはアクセス不可
  if (!hasAccountingRole && !isGlobalAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex h-screen">
          <AppSidebar />
          <div className="flex-1 flex flex-col">
            <main className="flex-1 flex items-center justify-center p-6">
              <Card className="max-w-md">
                <CardHeader>
                  <CardTitle>アクセス権限がありません</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    このページは会計またはAdmin権限を持つユーザーのみアクセスできます。
                  </p>
                </CardContent>
              </Card>
            </main>
          </div>
        </div>
        <MobileSidebar />
        <MobileBottomNav />
      </div>
    );
  }

  if (budgetsError) {
    console.error("budgets取得エラー:", budgetsError);
  }

  if (usageError) {
    console.error("get_budget_usage RPCエラー:", usageError);
  }

  const usageMap: Record<string, { expenses: number; pending: number }> = {};
  (usageRows || []).forEach((row: any) => {
    usageMap[row.accounting_group_id] = {
      expenses: Number(row.expenses),
      pending: Number(row.pending),
    };
  });

  const budgetStatus = (budgets || []).map((b: any) => {
    const group = (categories || []).find(
      (c: any) => c.id === b.accounting_group_id,
    );
    return {
      budget_id: b.id,
      category_id: b.accounting_group_id,
      category_name: group?.name || "",
      budget_amount: Number(b.amount) || 0,
      expenses: usageMap[b.accounting_group_id]?.expenses || 0,
      pending: usageMap[b.accounting_group_id]?.pending || 0,
    };
  });

  // 予算が設定されていない会計グループも含めた一覧
  const allGroupsWithBudget = (categories || []).map((c: any) => {
    const budget = (budgets || []).find(
      (b: any) => b.accounting_group_id === c.id,
    );
    return {
      group_id: c.id,
      group_name: c.name,
      budget_amount: budget ? Number(budget.amount) : 0,
      expenses: usageMap[c.id]?.expenses || 0,
      pending: usageMap[c.id]?.pending || 0,
    };
  });

  // ダイアログ用データ
  const groupsForDialog = (categories || []).map((c: any) => {
    const budget = (budgets || []).find(
      (b: any) => b.accounting_group_id === c.id,
    );
    return {
      id: c.id as string,
      name: c.name as string,
      currentBudget: budget ? Number(budget.amount) : 0,
    };
  });
  const existingYears = (fiscalYears || []).map((fy: any) => fy.year as number);
  const isCurrentFY =
    fiscalYears?.find((fy: any) => fy.year === fyYear)?.is_current ?? false;
  const canEdit =
    isGlobalAdmin ||
    ((hasAccountingRole ||
      Object.values(myGroupRoles).includes(ROLE_TYPES.LEADER)) &&
      isCurrentFY);

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <main className="flex-1 flex flex-col p-6 pt-16 md:pt-6 pb-20 md:pb-6 overflow-y-auto">
            <div className="max-w-5xl mx-auto w-full space-y-8">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    予算管理
                  </h1>
                </div>
                <YearSelector
                  fiscalYears={fiscalYears || []}
                  selectedYear={fyYear}
                />
              </div>

              {!isCurrentFY && !isGlobalAdmin && (
                <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200">
                  過年度データのため閲覧専用です
                </div>
              )}

              <BudgetOverview data={budgetStatus as any} />

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
                        <TableHead className="text-right">支出額</TableHead>
                        <TableHead className="text-right">申請中</TableHead>
                        <TableHead className="text-right">残額</TableHead>
                        <TableHead className="text-right">使用率</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allGroupsWithBudget.map((item: any) => {
                        const totalUsed = item.expenses + item.pending;
                        const remaining = item.budget_amount - totalUsed;
                        const usageRate =
                          item.budget_amount > 0
                            ? (totalUsed / item.budget_amount) * 100
                            : 0;
                        return (
                          <TableRow key={item.group_id}>
                            <TableCell className="font-medium">
                              {item.group_name}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(item.budget_amount)}
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
                                    ? "text-red-600 font-semibold"
                                    : usageRate > 75
                                      ? "text-orange-600"
                                      : "text-green-600"
                                }`}
                              >
                                {usageRate.toFixed(1)}%
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {canEdit && fyYear && (
                <div className="flex flex-wrap gap-3">
                  <BudgetUpdateDialog
                    groups={groupsForDialog}
                    fiscalYear={fyYear}
                  />
                  <NewFiscalYearDialog
                    groups={groupsForDialog.map((g) => ({
                      id: g.id,
                      name: g.name,
                    }))}
                    existingYears={existingYears}
                  />
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
      <MobileSidebar />
      <MobileBottomNav />
    </div>
  );
}
