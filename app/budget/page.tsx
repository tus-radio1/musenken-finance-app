import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetOverview } from "@/components/budget-overview";
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
import {
  synthesizeLedgerRows,
  TransactionRow,
  SubsidyItemData,
} from "@/lib/ledger";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { ROLE_TYPES, ROLE_NAMES_JA } from "@/lib/roles/constants";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // ロール情報取得
  let isGlobalAdmin = false;
  let hasAccountingRole = false;
  const myGroupRoles: Record<string, string> = {};
  if (user) {
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("roles(name, type, accounting_group_id)")
      .eq("user_id", user.id);
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
  }

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

  // 年度一覧を取得 (RLS handles authorization for SELECT)
  const { data: fiscalYears, error: fiscalYearsError } = await supabase
    .from("fiscal_years")
    .select("year, is_current")
    .order("year", { ascending: false });

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

  // 会計グループ一覧 (RLS handles authorization for SELECT)
  const { data: categories } = await supabase
    .from("accounting_groups")
    .select("id, name")
    .order("name");

  // 予算一覧（当該年度）
  let budgetQuery = supabase
    .from("budgets")
    .select("id, accounting_group_id, amount, fiscal_year_id");
  if (typeof fyYear !== "undefined") {
    budgetQuery = budgetQuery.eq("fiscal_year_id", fyYear);
  }
  const { data: budgets, error: budgetsError } = await budgetQuery;

  if (budgetsError) {
    console.error("budgets取得エラー:", budgetsError);
  }
  // 取引集計（支出のみ）
  let txQuery = supabase.from("transactions").select("*");
  if (typeof fyYear !== "undefined") {
    txQuery = txQuery.eq("fiscal_year_id", fyYear);
  }

  // 支援金データの取得（統合用）
  let subsidyQuery = supabase
    .from("subsidy_items")
    .select(
      "id, name, requested_amount, approved_amount, actual_amount, created_at, applicant_id, receipt_date, status, accounting_group_id",
    )
    .in("status", ["approved", "receipt_submitted", "paid"])
    .is("deleted_at", null);

  if (typeof fyYear !== "undefined") {
    subsidyQuery = subsidyQuery.eq("fiscal_year_id", fyYear);
  }

  const [txResult, subsidyResult] = await Promise.all([txQuery, subsidyQuery]);
  const transactionsRaw = txResult.data || [];
  const subsidyData = subsidyResult.data || [];

  const transactions = synthesizeLedgerRows(
    transactionsRaw as unknown as TransactionRow[],
    subsidyData as SubsidyItemData[],
  );

  if (txResult.error) {
    console.error("transactions取得エラー:", txResult.error);
  }

  const usageMap: Record<string, { expenses: number; pending: number }> = {};
  (transactions || []).forEach((tx: any) => {
    const gid = tx.accounting_group_id as string;
    if (!gid) return;
    const amt = Number(tx.amount);
    if (!usageMap[gid]) usageMap[gid] = { expenses: 0, pending: 0 };

    if (tx.approval_status === "refunded") {
      if (amt < 0) {
        usageMap[gid].expenses += Math.abs(amt);
      } else {
        // 収入（支援金受領等）は確定支出から差し引く
        usageMap[gid].expenses -= amt;
      }
    } else if (
      ["pending", "accepted", "approved"].includes(tx.approval_status)
    ) {
      if (amt < 0) {
        usageMap[gid].pending += Math.abs(amt);
      } else {
        // 未受領の支援金収入は申請中から差し引く
        usageMap[gid].pending -= amt;
      }
    }
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
  const canEdit =
    isGlobalAdmin ||
    hasAccountingRole ||
    Object.values(myGroupRoles).includes(ROLE_TYPES.LEADER);

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
