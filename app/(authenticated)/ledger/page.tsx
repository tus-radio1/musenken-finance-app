import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import LedgerView from "@/components/ledger-view";
import { getUserTeams, TeamInfo } from "@/lib/teams";
import { getAccountingUserId } from "@/lib/system-config";
import { getFiscalYears, getAccountingGroups } from "@/lib/cache";
import { fetchLedgerTransactions } from "./actions";
import type { LedgerInitialData } from "@/lib/ledger";

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
  const [teamData, accountingUserId, fiscalYears, { data: profiles }] =
    await Promise.all([
      profileId
        ? getUserTeams(supabase, supabase, profileId)
        : Promise.resolve({ isGlobalAdmin: false, isAccountingUser: false, isFullAccess: false, roleGroupIds: [] as string[], teams: [] as TeamInfo[] }),
      getAccountingUserId(),
      getFiscalYears(),
      supabase.from("profiles").select("id, name").is("deleted_at", null),
    ]);

  isGlobalAdmin = teamData.isGlobalAdmin;
  isAccountingUser = teamData.isAccountingUser;
  myTeams = teamData.teams;
  const { isFullAccess: teamFullAccess, roleGroupIds } = teamData;

  const selectedYearParam = params.year;
  let fyYear: number | undefined;

  if (selectedYearParam !== undefined) {
    const parsedYear = Number.parseInt(selectedYearParam, 10);
    if (!Number.isNaN(parsedYear)) {
      fyYear = parsedYear;
    } else {
      // Invalid year parameter; fall back to current or latest fiscal year
      const currentFY = fiscalYears?.find((fy) => fy.is_current);
      fyYear = currentFY?.year ?? undefined;
      if (fyYear === undefined && fiscalYears && fiscalYears.length > 0) {
        fyYear = fiscalYears[0]?.year ?? undefined;
      }
    }
  } else {
    const currentFY = fiscalYears?.find((fy) => fy.is_current);
    fyYear = currentFY?.year ?? undefined;
    if (fyYear === undefined && fiscalYears && fiscalYears.length > 0) {
      fyYear = fiscalYears[0]?.year ?? undefined;
    }
  }

  const isCurrentFY =
    fiscalYears?.find((fy) => fy.year === fyYear)?.is_current ?? false;
  const isReadOnly = !isCurrentFY && !isGlobalAdmin;

  // 過年度の場合、その年度に予算が設定されていたグループのみに絞り込む
  // （現在Inactiveでも、その年度時点でActiveだったグループ＝予算が存在するグループも含む）
  let displayTeams = myTeams;
  if (fyYear && !isCurrentFY) {
    const [{ data: budgetsForYear }, allGroups] = await Promise.all([
      supabase
        .from("budgets")
        .select("accounting_group_id")
        .eq("fiscal_year_id", fyYear),
      getAccountingGroups(),
    ]);

    type AccountingGroupCached = { id: string; name: string; is_active: boolean; type: string | null };
    const typedGroups = (allGroups || []) as AccountingGroupCached[];

    const groupsWithBudget = new Set(
      (budgetsForYear || []).map((b) => b.accounting_group_id),
    );

    if (teamFullAccess) {
      // 全アクセス権ユーザー（管理者・会計・議長・副議長）:
      // その年度に予算があった全グループを表示（inactive含む）
      const historicalTeams: TeamInfo[] = typedGroups
        .filter((g) => groupsWithBudget.has(g.id))
        .map((g) => ({
          id: g.id,
          name: g.name,
          type: (g.type === "leader" ? "leader" : "general") as "general" | "leader",
        }));
      if (historicalTeams.length > 0) {
        displayTeams = historicalTeams;
      }
    } else {
      // 一般ユーザー: generalグループ＋ユーザーが所属するグループのうち、
      // その年度に予算があったもの（inactive含む）
      const eligibleGroupIds = new Set([
        ...typedGroups
          .filter((g) => g.type === "general" || !g.type)
          .map((g) => g.id),
        ...(roleGroupIds ?? []),
      ]);
      const historicalTeams: TeamInfo[] = typedGroups
        .filter((g) => groupsWithBudget.has(g.id) && eligibleGroupIds.has(g.id))
        .map((g) => ({
          id: g.id,
          name: g.name,
          type: (g.type === "leader" ? "leader" : "general") as "general" | "leader",
        }));
      if (historicalTeams.length > 0) {
        displayTeams = historicalTeams;
      }
    }
  }

  // 初期表示用の取引データをサーバー側で取得し、LedgerView に渡す (P-1)
  const firstGroupId = displayTeams[0]?.id;
  let initialData: LedgerInitialData | null = null;
  if (firstGroupId) {
    const res = await fetchLedgerTransactions({
      accountingGroupId: firstGroupId,
      fyYear,
    });
    if (!("error" in res)) {
      initialData = res;
    }
  }

  return (
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
          fiscalYears={(fiscalYears || []).map((fy) => ({ ...fy, is_current: fy.is_current ?? false }))}
          selectedYear={fyYear}
          isReadOnly={isReadOnly}
          initialData={initialData}
        />
      </div>
    </main>
  );
}
