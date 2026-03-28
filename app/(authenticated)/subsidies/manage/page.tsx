import { fetchAllSubsidies, fetchProfilesList } from "./actions";
import { SubsidiesManageClientPage } from "./client-page";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { FiscalYearSelector } from "@/components/fiscal-year-selector";

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
    selectedYear = parseInt(selectedYearParam, 10);
  } else {
    const currentFY = fiscalYears?.find((fy: any) => fy.is_current);
    selectedYear = currentFY?.year ?? undefined;
    if (!selectedYear && fiscalYears && fiscalYears.length > 0) {
      selectedYear = fiscalYears[0]?.year ?? undefined;
    }
  }

  const isCurrentFY =
    fiscalYears?.find((fy: any) => fy.year === selectedYear)?.is_current ??
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
      <div className="min-h-screen bg-background flex h-screen">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <main className="flex-1 flex justify-center items-center p-6 overflow-y-auto">
            <div className="text-center space-y-4">
              <p className="text-destructive font-medium">{result.error}</p>
            </div>
          </main>
        </div>
        <MobileSidebar />
        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6 pt-16 md:pt-6 pb-20 md:pb-6">
            <div className="max-w-7xl mx-auto w-full space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <h2 className="text-2xl font-bold tracking-tight">
                  支援金管理
                </h2>
                <FiscalYearSelector
                  fiscalYears={fiscalYears || []}
                  selectedYear={selectedYear}
                  basePath="/subsidies/manage"
                />
              </div>
              {isReadOnly && (
                <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200">
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
            </div>
          </main>
        </div>
      </div>
      <MobileSidebar />
      <MobileBottomNav />
    </div>
  );
}
