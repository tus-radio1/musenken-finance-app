import { createClient, createAdminClient } from "@/utils/supabase/server";
import { TransactionForm } from "@/components/transaction-form";
import { AppSidebar } from "@/components/app-sidebar";
import { ApplicationsTable } from "@/components/applications-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { getUserTeams } from "@/lib/teams";

export default async function ApplicationsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const admin = createAdminClient();

  // 会計グループ一覧を取得
  const teamData = await getUserTeams(supabase, admin, user.id);
  const accountingGroups = teamData.teams;

  // 当該ユーザの過去の申請を取得（会計グループ名付き）
  const { data: transactions } = await supabase
    .from("transactions")
    .select(
      "id, date, amount, description, approval_status, accounting_group_id, accounting_groups(name)",
    )
    .eq("created_by", user.id)
    .order("date", { ascending: false });

  // テーブル用にデータを整形
  const tableData = (transactions || []).map((tx: any) => ({
    id: tx.id,
    date: tx.date,
    amount: tx.amount,
    description: tx.description,
    approval_status: tx.approval_status,
    accounting_group_id: tx.accounting_group_id || undefined,
    accounting_group_name: tx.accounting_groups?.name || "-",
  }));

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <main className="flex-1 flex flex-col p-6 pt-16 md:pt-6 pb-20 md:pb-6 overflow-y-auto">
            <div className="max-w-7xl mx-auto w-full space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    経費申請
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    無線研での活動費を経費として申請できます。
                  </p>
                </div>
                <div className="hidden md:block">
                  <TransactionForm categories={accountingGroups || []} />
                </div>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>あなたの申請一覧</CardTitle>
                </CardHeader>
                <CardContent>
                  <ApplicationsTable transactions={tableData} accountingGroups={accountingGroups || []} />
                </CardContent>
              </Card>

              <div className="md:hidden">
                <TransactionForm categories={accountingGroups || []} />
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
