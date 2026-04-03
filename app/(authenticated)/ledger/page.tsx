import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import LedgerView from "@/components/ledger-view";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { getUserTeams, TeamInfo } from "@/lib/teams";
import { getAccountingUserId } from "@/lib/system-config";

type Role = {
  name: string | null;
  type: string | null;
  accounting_group_id: string | null;
};

type AccountingGroup = {
  id: string;
  name: string;
};

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let isGlobalAdmin = false;
  let isAccountingUser = false;
  let profileId: string | null = null;
  let myTeams: TeamInfo[] = [];

  if (user) {
    profileId = user.id;
  }

  const params = await searchParams;

  // getUserTeams + getAccountingUserId + fiscalYears + profiles are independent — run in parallel
  const [teamData, accountingUserId, { data: fiscalYears }, { data: profiles }] =
    await Promise.all([
      profileId
        ? getUserTeams(supabase, supabase, profileId)
        : Promise.resolve({ isGlobalAdmin: false, isAccountingUser: false, teams: [] as TeamInfo[] }),
      getAccountingUserId(),
      supabase
        .from("fiscal_years")
        .select("year, is_current")
        .order("year", { ascending: false }),
      supabase.from("profiles").select("id, name").is("deleted_at", null),
    ]);

  isGlobalAdmin = teamData.isGlobalAdmin;
  isAccountingUser = teamData.isAccountingUser;
  myTeams = teamData.teams;

  const selectedYearParam = params.year;
  let fyYear: number | undefined;

  if (selectedYearParam !== undefined) {
    const parsedYear = Number.parseInt(selectedYearParam, 10);
    if (!Number.isNaN(parsedYear)) {
      fyYear = parsedYear;
    } else {
      // Invalid year parameter; fall back to current or latest fiscal year
      const currentFY = fiscalYears?.find((fy: any) => fy.is_current);
      fyYear = currentFY?.year ?? undefined;
      if (fyYear === undefined && fiscalYears && fiscalYears.length > 0) {
        fyYear = fiscalYears[0]?.year ?? undefined;
      }
    }
  } else {
    const currentFY = fiscalYears?.find((fy: any) => fy.is_current);
    fyYear = currentFY?.year ?? undefined;
    if (fyYear === undefined && fiscalYears && fiscalYears.length > 0) {
      fyYear = fiscalYears[0]?.year ?? undefined;
    }
  }

  const isCurrentFY =
    fiscalYears?.find((fy: any) => fy.year === fyYear)?.is_current ?? false;
  const isReadOnly = !isCurrentFY && !isGlobalAdmin;

  // 過年度の場合、予算が設定されているグループのみに絞り込む
  let displayTeams = myTeams;
  if (fyYear && !isCurrentFY) {
    const { data: budgetsForYear } = await supabase
      .from("budgets")
      .select("accounting_group_id")
      .eq("fiscal_year_id", fyYear);
    const groupsWithBudget = new Set(
      (budgetsForYear || []).map((b: any) => b.accounting_group_id),
    );
    const filtered = myTeams.filter((t) => groupsWithBudget.has(t.id));
    // グループが1つも見つからない場合は全グループを表示（データ移行前など）
    if (filtered.length > 0) {
      displayTeams = filtered;
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <main className="flex-1 flex flex-col p-6 pt-16 md:pt-6 pb-20 md:pb-6 overflow-y-auto">
            <div className="max-w-7xl mx-auto w-full space-y-8">
              <LedgerView
                teams={displayTeams}
                fyYear={fyYear}
                isGlobalAdmin={isGlobalAdmin}
                isAccountingUser={isAccountingUser}
                currentProfileId={profileId || undefined}
                users={profiles || []}
                accountingUserId={accountingUserId}
                fiscalYears={fiscalYears || []}
                selectedYear={fyYear}
                isReadOnly={isReadOnly}
              />
            </div>
          </main>
        </div>
      </div>
      <MobileSidebar />
      <MobileBottomNav />
    </div>
  );
}
