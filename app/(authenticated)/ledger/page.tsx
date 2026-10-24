import { getCurrentUser, getCurrentRoles } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import LedgerView from "@/components/ledger-view";
import { selectVisibleTeams, type TeamInfo } from "@/lib/teams";
import { isAdmin } from "@/lib/roles/permissions";
import { getAccountingUserId } from "@/lib/system-config";
import { getFiscalYears, getAccountingGroups } from "@/lib/cache";
import { readLedgerTransactions } from "@/lib/ledger-data";
import type { LedgerInitialData } from "@/lib/ledger";
import { PageShell } from "@/components/layout/page-shell";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const auth = await getCurrentUser();
  if (!auth) redirect("/login");
  const { supabase, user } = auth;

  const profileId = user.id;

  const params = await searchParams;

  // Roles, metadata, profiles and financial accounts are independent — run in parallel
  const [access, allGroups, accountingUserId, fiscalYears, { data: profiles }, { data: financialAccounts }] =
    await Promise.all([
      getCurrentRoles(),
      getAccountingGroups(),
      getAccountingUserId(),
      getFiscalYears(),
      supabase.from("profiles").select("id, name").is("deleted_at", null),
      supabase.from("financial_accounts").select("id, name, is_active").order("display_order"),
    ]);

  const isGlobalAdmin = isAdmin(access);
  const myTeams: TeamInfo[] = selectVisibleTeams(access, allGroups);

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
    const { data: budgetsForYear } = await supabase
      .from("budgets")
      .select("accounting_group_id")
      .eq("fiscal_year_id", fyYear);

    const groupsWithBudget = new Set(
      (budgetsForYear || []).map((b) => b.accounting_group_id),
    );

    const historicalTeams = selectVisibleTeams(
      access,
      allGroups.filter((g) => groupsWithBudget.has(g.id)),
      { includeInactive: true },
    );
    if (historicalTeams.length > 0) {
      displayTeams = historicalTeams;
    }
  }

  // 初期表示用の取引データをサーバー側で取得し、LedgerView に渡す (P-1)
  const firstGroupId = displayTeams[0]?.id;
  let initialData: LedgerInitialData | null = null;
  if (firstGroupId) {
    const res = await readLedgerTransactions(auth, access, {
      accountingGroupId: firstGroupId,
      fyYear,
    }, { profiles: profiles ?? [], financialAccounts: financialAccounts ?? [] });
    if (!("error" in res)) {
      initialData = res;
    }
  }

  return (
    <PageShell>
        <LedgerView
          teams={displayTeams}
          fyYear={fyYear}
          access={access}
          currentProfileId={profileId}
          users={profiles || []}
          accountingUserId={accountingUserId}
          fiscalYears={(fiscalYears || []).map((fy) => ({ ...fy, is_current: fy.is_current ?? false }))}
          selectedYear={fyYear}
          isReadOnly={isReadOnly}
          initialData={initialData}
          financialAccounts={(financialAccounts ?? []).filter((fa) => fa.is_active === true)}
        />
    </PageShell>
  );
}
