import { createClient } from "@/utils/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardStats } from "@/components/dashboard-stats";
import { RecentApplications } from "@/components/recent-applications";
import { MobileNewTransactionFab } from "@/components/mobile-new-transaction-fab";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { getUserTeams } from "@/lib/teams";
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

  let fyYear: number | undefined = fyCurrent?.year ?? undefined;
  if (!fyYear) {
    const { data: fyLatest } = await supabase
      .from("fiscal_years")
      .select("year")
      .order("year", { ascending: false })
      .limit(1);
    fyYear = fyLatest?.[0]?.year ?? undefined;
  }

  // 会計グループ一覧（FAB用）
  let categories: { id: string; name: string }[] = [];
  if (user) {
    const teamData = await getUserTeams(supabase, supabase, user.id);
    categories = teamData.teams;
  }

  // ログインユーザーの今年度の経費取引を取得
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

  const { data: myTransactions, error: txError } = await myTxQuery;

  // ログインユーザーの今年度の支援金申請を取得
  let mySubQuery = supabase
    .from("subsidy_items")
    .select("id, name, requested_amount, status, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (profileId) {
    mySubQuery = mySubQuery.eq("applicant_id", profileId);
  }
  if (typeof fyYear !== "undefined") {
    mySubQuery = mySubQuery.eq("fiscal_year_id", fyYear);
  }

  const { data: mySubsidies, error: subError } = await mySubQuery;

  const txList = myTransactions || [];
  const subList = mySubsidies || [];

  // --- 直近5件（経費+支援金を統合して時系列順）---
  type RecentItem = {
    id: string;
    date: string;
    description: string;
    amount: number;
    approval_status: string;
    source: "transaction" | "subsidy";
  };

  const txItems: RecentItem[] = txList.map((tx) => ({
    id: tx.id,
    date: tx.date ?? tx.created_at ?? "",
    description: tx.description ?? "",
    amount: tx.amount,
    approval_status: (tx.approval_status as string) ?? "",
    source: "transaction" as const,
  }));

  const subItems: RecentItem[] = subList.map((s) => ({
    id: s.id,
    date: s.created_at ?? "",
    description: s.name ?? "",
    amount: -(s.requested_amount as number),
    approval_status: (s.status as string) ?? "",
    source: "subsidy" as const,
  }));

  const allItems = [...txItems, ...subItems]
    .sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )
    .slice(0, 5);

  // --- 今年度の集計（経費+支援金）---
  const totalCountThisYear = txList.length + subList.length;

  // 申請中: 経費の「受付中」「受付済」+ 支援金の「受付中」「申請中(paid)」
  const pendingCountThisYear =
    txList.filter((tx) =>
      ["pending", "accepted"].includes(tx.approval_status as string),
    ).length +
    subList.filter((s) =>
      ["pending", "paid"].includes(s.status as string),
    ).length;

  // 承認済: 経費の「承認済」「領収書受領済」「返金済」+ 支援金の「審査通過(receipt_submitted)」「返金済(receipt_received)」
  const approvedCountThisYear =
    txList.filter((tx) =>
      ["approved", "receipt_received", "refunded"].includes(
        tx.approval_status as string,
      ),
    ).length +
    subList.filter((s) =>
      ["receipt_submitted", "receipt_received"].includes(s.status as string),
    ).length;

  // 今年度の申請金額（経費の支出=負の金額の絶対値 + 支援金の申請額）
  const totalAmountThisYear =
    txList.reduce((sum, tx) => {
      const amt = Number(tx.amount);
      return sum + (amt < 0 ? Math.abs(amt) : 0);
    }, 0) +
    subList.reduce((sum, s) => sum + Number(s.requested_amount), 0);

  if (txError || subError) {
    return (
      <div className="p-8 text-red-500">
        Error loading data: {txError?.message || subError?.message}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <main className="flex-1 flex flex-col p-6 pt-16 md:pt-6 pb-20 md:pb-6 overflow-y-auto">
            <div className="max-w-7xl mx-auto w-full space-y-8">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">ホーム</h1>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <RecentApplications items={allItems as any} />
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
