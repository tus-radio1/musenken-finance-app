import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRoles } from "@/lib/auth/context";
import { DashboardStats } from "@/components/dashboard-stats";
import { RecentApplications } from "@/components/recent-applications";
import { MobileNewTransactionFab } from "@/components/mobile-new-transaction-fab";
import { getSortableDateValue } from "@/lib/date";
import { selectVisibleTeams } from "@/lib/teams";
import { getAccountingGroups } from "@/lib/cache";
import { canFileTransactionInGroup } from "@/lib/roles/permissions";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState } from "@/components/feedback/error-state";

export default async function Home() {
  const auth = await getCurrentUser();
  if (!auth) redirect("/login");
  const { supabase, profileId } = auth;

  // 会計年度の決定 + チーム情報を並列取得
  const [{ data: fyCurrent }, access, allGroups] = await Promise.all([
    supabase
      .from("fiscal_years")
      .select("year")
      .eq("is_current", true)
      .single(),
    getCurrentRoles(),
    getAccountingGroups(),
  ]);

  let fyYear: number | undefined = fyCurrent?.year ?? undefined;
  if (!fyYear) {
    // is_current が無ければ最新年度にフォールバック
    const { data: fyLatest } = await supabase
      .from("fiscal_years")
      .select("year")
      .order("year", { ascending: false })
      .limit(1);
    fyYear = fyLatest?.[0]?.year ?? undefined;
  }

  const categories = selectVisibleTeams(access, allGroups).filter((group) =>
    canFileTransactionInGroup(access, group),
  );

  // 経費取引・支援金申請を並列取得
  let myTxQuery = supabase
    .from("transactions")
    .select("id, date, description, amount, approval_status, created_at")
    .order("created_at", { ascending: false });

  if (profileId) myTxQuery = myTxQuery.eq("created_by", profileId);
  if (typeof fyYear !== "undefined") myTxQuery = myTxQuery.eq("fiscal_year_id", fyYear);

  let mySubQuery = supabase
    .from("subsidy_items")
    .select("id, name, requested_amount, status, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (profileId) mySubQuery = mySubQuery.eq("applicant_id", profileId);
  if (typeof fyYear !== "undefined") mySubQuery = mySubQuery.eq("fiscal_year_id", fyYear);

  const [
    { data: myTransactions, error: txError },
    { data: mySubsidies, error: subError },
  ] = await Promise.all([myTxQuery, mySubQuery]);

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
    .sort((a, b) => getSortableDateValue(b.date) - getSortableDateValue(a.date))
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

  // 完了分: 経費と支援金の完了ステータスを合算
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
    console.error("[HomeDataError]", {
      transactionError: txError,
      subsidyError: subError,
    });
    return (
      <PageShell>
        <PageHeader title="ホーム" />
        <ErrorState
          title="ホーム情報を読み込めませんでした"
          description="データの取得中にエラーが発生しました。時間をおいて再度お試しください。"
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader title="ホーム" />
      <div className="flex flex-col gap-4">
        <RecentApplications items={allItems} />
        <DashboardStats
          totalCountThisYear={totalCountThisYear}
          pendingCountThisYear={pendingCountThisYear}
          approvedCountThisYear={approvedCountThisYear}
          totalAmountThisYear={totalAmountThisYear}
        />
      </div>
      <MobileNewTransactionFab categories={categories || []} />
    </PageShell>
  );
}
