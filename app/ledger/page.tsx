import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import LedgerView from "@/components/ledger-view";

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

  // ロール情報取得（所属グループ）
  let isGlobalAdmin = false;
  let isAccountingUser = false;
  let profileId: string | null = null;
  const myTeams: Array<{
    id: string;
    name: string;
    type: "general" | "leader";
  }> = [];
  if (user) {
    profileId = user.id;

    // profile, roles, categories を並列取得
    const [{ data: profile }, { data: userRoles }, { data: categories }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("role")
          .eq("id", profileId)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("roles(name, type, accounting_group_id)")
          .eq("user_id", profileId),
        admin.from("accounting_groups").select("id, name").order("name"),
      ]);

    isAccountingUser = profile?.role === "accounting";

    const roles: Role[] = (userRoles || []).flatMap((ur) => {
      const rr = (ur as unknown as { roles?: Role | Role[] | null }).roles;
      if (Array.isArray(rr)) return rr;
      return rr ? [rr] : [];
    });
    isGlobalAdmin = roles.some((r) => r.type === "admin");
    if (!isAccountingUser) {
      isAccountingUser = roles.some((r) => r?.name === "会計");
    }

    const safeCategories: AccountingGroup[] = (categories ||
      []) as unknown as AccountingGroup[];

    // 部長・副部長も全グループアクセス可能
    const isFullAccess =
      isAccountingUser ||
      isGlobalAdmin ||
      roles.some((r) => r?.name === "部長" || r?.name === "副部長");

    if (isFullAccess) {
      safeCategories.forEach((c) => {
        myTeams.push({ id: c.id, name: c.name, type: "general" });
      });
    } else {
      // 全ユーザーに general タイプのグループを表示
      const { data: generalGroups } = await admin
        .from("accounting_groups")
        .select("id, name, type")
        .eq("type", "general")
        .order("name");

      (
        (generalGroups || []) as unknown as Array<{
          id: string;
          name: string;
          type: string;
        }>
      ).forEach((g) => {
        if (!myTeams.some((t) => t.id === g.id)) {
          myTeams.push({ id: g.id, name: g.name, type: "general" });
        }
      });

      // さらに所属班(会)のグループを追加
      roles.forEach((r) => {
        const gid = r?.accounting_group_id ?? undefined;
        if (!gid) return;
        const cat = safeCategories.find((c) => c.id === gid);
        if (!cat) return;
        if (myTeams.some((t) => t.id === gid)) return;
        const type: "general" | "leader" =
          r.type === "leader" ? "leader" : "general";
        myTeams.push({ id: gid, name: cat.name, type });
      });
    }
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
          <main className="flex-1 flex flex-col p-6 overflow-y-auto">
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
    </div>
  );
}
