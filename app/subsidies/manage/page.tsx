import { fetchAllSubsidies, fetchProfilesList } from "./actions";
import { SubsidiesManageClientPage } from "./client-page";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

import { createAdminClient } from "@/utils/supabase/server";

export default async function SubsidiesManagePage() {
  const admin = createAdminClient();
  const [result, profilesResult, groupsResult] = await Promise.all([
    fetchAllSubsidies(),
    fetchProfilesList(),
    admin.from("accounting_groups").select("id, name").order("name"),
  ]);

  if (result.error) {
    return (
      <div className="min-h-screen bg-gray-50 flex h-screen">
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
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6 pt-16 md:pt-6 pb-20 md:pb-6">
            <div className="max-w-7xl mx-auto w-full space-y-6">
              <SubsidiesManageClientPage
                initialData={result.data || []}
                profiles={profilesResult.data || []}
                accountingGroups={groupsResult.data || []}
                isAdmin={result.isAdmin || false}
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
