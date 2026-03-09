import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import LedgerView from "@/components/ledger-view";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { getUserTeams, TeamInfo } from "@/lib/teams";

type Role = {
  name: string | null;
  type: string | null;
  accounting_group_id: string | null;
};

type AccountingGroup = {
  id: string;
  name: string;
};

export default async function LedgerPage() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isGlobalAdmin = false;
  let isAccountingUser = false;
  let profileId: string | null = null;
  let myTeams: TeamInfo[] = [];

  if (user) {
    profileId = user.id;
    const teamData = await getUserTeams(supabase, admin, profileId);
    isGlobalAdmin = teamData.isGlobalAdmin;
    isAccountingUser = teamData.isAccountingUser;
    myTeams = teamData.teams;
  }

  // 年度決定 と profiles を並列取得
  const [{ data: fyCurrent }, { data: profiles }] = await Promise.all([
    admin.from("fiscal_years").select("year").eq("is_current", true).single(),
    admin.from("profiles").select("id, name"),
  ]);

  let fyYear: number | undefined = fyCurrent?.year as number | undefined;
  if (!fyYear) {
    const { data: fyLatest } = await admin
      .from("fiscal_years")
      .select("year")
      .order("year", { ascending: false })
      .limit(1);
    fyYear = fyLatest?.[0]?.year as number | undefined;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <main className="flex-1 flex flex-col p-6 pt-16 md:pt-6 pb-20 md:pb-6 overflow-y-auto">
            <div className="max-w-7xl mx-auto w-full space-y-8">
              <LedgerView
                teams={myTeams}
                fyYear={fyYear}
                isGlobalAdmin={isGlobalAdmin}
                isAccountingUser={isAccountingUser}
                currentProfileId={profileId || undefined}
                users={profiles || []}
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
