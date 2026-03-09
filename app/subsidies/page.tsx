import { createClient } from "@/utils/supabase/server";
import { SubsidyForm } from "@/components/subsidy-form";
import { AppSidebar } from "@/components/app-sidebar";
import { SubsidyItemsTable } from "@/components/subsidy-items-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  extractStudentNumberFromUser,
  findProfileIdByStudentNumber,
} from "@/lib/account";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

export default async function SubsidiesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);

  // 会計グループ一覧を取得
  const { data: accountingGroups } = await supabase
    .from("accounting_groups")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  // 当該ユーザの支援金申請を取得
  const { data: subsidyItems } = await supabase
    .from("subsidy_items")
    .select(
      "id, category, term, expense_type, name, requested_amount, approved_amount, status, justification, evidence_url, created_at, accounting_group_id, accounting_groups(name)",
    )
    .eq("applicant_id", profileId!)
    .order("created_at", { ascending: false });

  // テーブル用にデータを整形
  const tableData = (subsidyItems || []).map((item: any) => ({
    id: item.id,
    category: item.category,
    term: item.term,
    expense_type: item.expense_type,
    name: item.name,
    requested_amount: item.requested_amount,
    approved_amount: item.approved_amount,
    status: item.status,
    accounting_group_name: item.accounting_groups?.name || "-",
    created_at: item.created_at,
  }));

  // 集計: 種別ごとの件数
  const categoryCounts = {
    activity: tableData.filter((i) => i.category === "activity").length,
    league: tableData.filter((i) => i.category === "league").length,
    special: tableData.filter((i) => i.category === "special").length,
  };
  const pendingCount = tableData.filter((i) => i.status === "pending").length;
  const totalRequested = tableData.reduce(
    (sum, i) => sum + i.requested_amount,
    0,
  );

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
    }).format(amount);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <main className="flex-1 flex flex-col p-6 pt-16 md:pt-6 pb-20 md:pb-6 overflow-y-auto">
            <div className="max-w-7xl mx-auto w-full space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    支援金申請
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    課外活動支援金等の申請と履歴を管理します。
                  </p>
                </div>
                <div className="hidden md:block">
                  <SubsidyForm categories={accountingGroups || []} />
                </div>
              </div>

              {/* 集計カード */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="text-xs text-muted-foreground">申請中</div>
                    <div className="text-2xl font-bold text-yellow-600">
                      {pendingCount}件
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="text-xs text-muted-foreground">
                      申請合計金額
                    </div>
                    <div className="text-lg font-bold">
                      {formatCurrency(totalRequested)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="text-xs text-muted-foreground">
                      活動 / 連盟 / 特別
                    </div>
                    <div className="text-lg font-bold">
                      {categoryCounts.activity} / {categoryCounts.league} /{" "}
                      {categoryCounts.special}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="text-xs text-muted-foreground">
                      全申請数
                    </div>
                    <div className="text-2xl font-bold">
                      {tableData.length}件
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>あなたの支援金申請一覧</CardTitle>
                </CardHeader>
                <CardContent>
                  <SubsidyItemsTable
                    items={tableData}
                    accountingGroups={accountingGroups || []}
                  />
                </CardContent>
              </Card>

              <div className="md:hidden">
                <SubsidyForm categories={accountingGroups || []} />
              </div>
            </div>
          </main>
        </div>
      </div>
      <MobileSidebar />
      <MobileBottomNav />
    </div>
  );
}
