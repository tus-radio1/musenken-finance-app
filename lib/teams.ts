import { SupabaseClient } from "@supabase/supabase-js";

export type TeamInfo = {
  id: string;
  name: string;
  type: "general" | "leader";
};

export async function getUserTeams(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
): Promise<{
  teams: TeamInfo[];
  isGlobalAdmin: boolean;
  isAccountingUser: boolean;
}> {
  let isGlobalAdmin = false;
  let isAccountingUser = false;
  const myTeams: TeamInfo[] = [];

  const [{ data: profile }, { data: userRoles }, { data: categories }] =
    await Promise.all([
      supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
      supabase
        .from("user_roles")
        .select("roles(name, type, accounting_group_id)")
        .eq("user_id", userId),
      admin
        .from("accounting_groups")
        .select("id, name, is_active")
        .order("name"),
    ]);

  isAccountingUser = profile?.role === "accounting";

  type Role = {
    name: string | null;
    type: string | null;
    accounting_group_id: string | null;
  };

  const roles: Role[] = (userRoles || []).flatMap((ur) => {
    const rr = (ur as unknown as { roles?: Role | Role[] | null }).roles;
    if (Array.isArray(rr)) return rr;
    return rr ? [rr] : [];
  });

  isGlobalAdmin = roles.some((r) => r.type === "admin");
  if (!isAccountingUser) {
    isAccountingUser = roles.some((r) => r?.name === "会計");
  }

  const safeCategories = ((categories || []) as any[]).filter(
    (c) => c.is_active !== false,
  );

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
      .eq("is_active", true)
      .order("name");

    (generalGroups || []).forEach((g: any) => {
      if (!myTeams.some((t) => t.id === g.id)) {
        myTeams.push({ id: g.id, name: g.name, type: "general" });
      }
    });

    // さらに所属班のグループを追加
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

  return { teams: myTeams, isGlobalAdmin, isAccountingUser };
}
