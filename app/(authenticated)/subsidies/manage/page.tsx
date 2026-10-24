import { fetchAllSubsidies, fetchProfilesList } from "./actions";
import { SubsidiesManageClientPage } from "./client-page";
import { FiscalYearSelector } from "@/components/fiscal-year-selector";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { AccessDenied } from "@/components/feedback/access-denied";
import { ErrorState } from "@/components/feedback/error-state";

import { createClient } from "@/utils/supabase/server";

export default async function SubsidiesManagePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  // Uses createClient() with RLS - role-based access is enforced by RLS policies
  const supabase = await createClient();
  const params = await searchParams;

  // Fetch fiscal years for year selector
  const { data: fiscalYears } = await supabase
    .from("fiscal_years")
    .select("year, is_current")
    .order("year", { ascending: false });

  // Determine selected year
  const selectedYearParam = params.year;
  let selectedYear: number | undefined;

  if (selectedYearParam) {
    const parsedYear = parseInt(selectedYearParam, 10);
    if (Number.isFinite(parsedYear)) {
      selectedYear = parsedYear;
    }
  }

  // Fallback to current or latest fiscal year if no valid selected year from params
  if (selectedYear === undefined) {
    const currentFY = fiscalYears?.find((fy) => fy.is_current);
    selectedYear = currentFY?.year ?? undefined;
    if (!selectedYear && fiscalYears && fiscalYears.length > 0) {
      selectedYear = fiscalYears[0]?.year ?? undefined;
    }
  }

  const isCurrentFY =
    fiscalYears?.find((fy) => fy.year === selectedYear)?.is_current ??
    false;

  const [result, profilesResult, groupsResult] = await Promise.all([
    fetchAllSubsidies(selectedYear),
    fetchProfilesList(),
    supabase.from("accounting_groups").select("id, name").order("name"),
  ]);

  const isAdmin = result.isAdmin || false;
  const isReadOnly = !isCurrentFY && !isAdmin;

  if (result.error) {
    return (
      <PageShell>
        <PageHeader title="支援金管理" />
        {result.error.includes("権限") ? (
          <AccessDenied description="このページは会計またはAdmin権限を持つユーザーのみアクセスできます。" />
        ) : (
          <ErrorState
            title="支援金データを読み込めませんでした"
            description="支援金申請データの取得中にエラーが発生しました。時間をおいて再度お試しください。"
          />
        )}
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="支援金管理"
        actions={
          <FiscalYearSelector
            fiscalYears={(fiscalYears || []).map((fy) => ({ ...fy, is_current: fy.is_current ?? false }))}
            selectedYear={selectedYear}
            basePath="/subsidies/manage"
          />
        }
      />
        {isReadOnly && (
          <div className="rounded-md border border-warning/50 bg-warning px-4 py-3 text-sm text-warning-foreground">
            過年度データのため閲覧専用です
          </div>
        )}
        <SubsidiesManageClientPage
          key={selectedYear}
          initialData={result.data || []}
          profiles={profilesResult.data || []}
          accountingGroups={groupsResult.data || []}
          isAdmin={isAdmin}
          isReadOnly={isReadOnly}
        />
    </PageShell>
  );
}
