import { createClient } from "@/utils/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardStats } from "@/components/dashboard-stats";
import { RecentApplications } from "@/components/recent-applications";
import { MobileNewTransactionFab } from "@/components/mobile-new-transaction-fab";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import {
  extractStudentNumberFromUser,
  findProfileIdByStudentNumber,
} from "@/lib/account";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profileId: string | null = null;
  if (user) {
    const studentNumber = extractStudentNumberFromUser(user);
    profileId = await findProfileIdByStudentNumber(supabase, studentNumber);
  }

  // 会計年度の決定（is_current が無ければ最新年度にフォールバック）
  const { data: fyCurrent } = await supabase
    .from("fiscal_years")
    .select("year")
    .eq("is_current", true)
    .single();

  let fyYear: number | undefined = fyCurrent?.year as number | undefined;
  if (!fyYear) {
    const { data: fyLatest } = await supabase
      .from("fiscal_years")
      .select("year")
      .order("year", { ascending: false })
      .limit(1);
    fyYear = fyLatest?.[0]?.year as number | undefined;
  }

  // 会計グループ一覧（FAB用）
  const { data: categories } = await supabase
    .from("accounting_groups")
    .select("id, name")
    .order("name");

  // ログインユーザーの今年度の取引を取得
  let myTxQuery = supabase
    .from("transactions")
    .select("id, date, description, amount, approval_status, created_at")
    .order("created_at", { ascending: false });

  if (profileId) {
    myTxQuery = myTxQuery.eq("created_by", profileId);
  }
  if (typeof fyYear !== "undefined") {
    myTxQuery = myTxQuery.eq("fiscal_year_id", fyYear);
  }

  const { data: myTransactions, error } = await myTxQuery;

  const txList = myTransactions || [];

  // --- 今年度の集計 ---
  const totalCountThisYear = txList.length;

  const pendingCountThisYear = txList.filter(
    (tx) => tx.approval_status === "pending",
  ).length;

  const approvedCountThisYear = txList.filter(
    (tx) => tx.approval_status === "approved",
  ).length;

  // 今年度の申請金額（支出=負の金額の絶対値合計）
  const totalAmountThisYear = txList.reduce((sum, tx) => {
    const amt = Number(tx.amount);
    return sum + (amt < 0 ? Math.abs(amt) : 0);
  }, 0);

  // 直近5件
  const recentMyItems = txList.slice(0, 5);

  if (error) {
    return (
      <div className="p-8 text-red-500">
        Error loading data: {error.message}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <main className="flex-1 flex flex-col p-6 pt-16 md:pt-6 pb-20 md:pb-6 overflow-y-auto">
            <div className="max-w-5xl mx-auto w-full space-y-8">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">ホーム</h1>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
                <RecentApplications items={recentMyItems as any} />
                <DashboardStats
                  totalCountThisYear={totalCountThisYear}
                  pendingCountThisYear={pendingCountThisYear}
                  approvedCountThisYear={approvedCountThisYear}
                  totalAmountThisYear={totalAmountThisYear}
                />
              </div>
            </div>
          </main>
        </div>
      </div>
      <MobileSidebar />
      <MobileBottomNav />
      <MobileNewTransactionFab categories={categories || []} />
    </div>
  );
}
