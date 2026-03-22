import { AppSidebar } from "@/components/app-sidebar";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { MembersTable, type MemberRow } from "@/components/members-table";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { ROLE_NAMES_JA } from "@/lib/roles/constants";
import { fetchMemberProfiles, type MemberProfileRow } from "@/lib/profiles";

type MemberRole = {
  accounting_group_id?: string | null;
  name?: string | null;
};

type MemberRoleRow = {
  roles: MemberRole | MemberRole[] | null;
  user_id: string;
};

export default async function MembersManagementPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profiles = await fetchMemberProfiles(supabase);

  const { data: allUserRoles } = await supabase
    .from("user_roles")
    .select("user_id, roles(name, accounting_group_id)");

  const roleNamesByUser: Record<string, string[]> = {};
  (allUserRoles as MemberRoleRow[] | null | undefined)?.forEach((row) => {
    const userId: string = row.user_id;
    const roles = row.roles;

    const addRoleName = (role: MemberRole) => {
      if (!role) return;
      const name = role.name;
      if (!name) return;
      const list = roleNamesByUser[userId] || [];
      if (!list.includes(name)) list.push(name);
      roleNamesByUser[userId] = list;
    };

    if (Array.isArray(roles)) roles.forEach(addRoleName);
    else addRoleName(roles);
  });

  const members: MemberRow[] = profiles
    .filter((profile: MemberProfileRow) => {
      // 「会計」ロールのみを持つアカウントを除外
      const names = roleNamesByUser[profile.id] || [];
      return !(names.length === 1 && names[0] === ROLE_NAMES_JA.ACCOUNTING);
    })
    .map((profile: MemberProfileRow) => {
      const names = roleNamesByUser[profile.id] || [];
      return {
        id: profile.id,
        name: profile.name,
        student_number: profile.student_number,
        grade: profile.grade,
        roles: names.length === 0 ? "一般部員" : names.join("、"),
      };
    });

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <main className="flex-1 flex flex-col p-6 pt-16 md:pt-6 pb-20 md:pb-6 overflow-y-auto">
            <div className="max-w-6xl mx-auto w-full">
              <Card>
                <CardHeader>
                  <CardTitle>部員情報管理</CardTitle>
                  <CardDescription>
                    登録されているメンバーの基本情報を一覧表示します。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <MembersTable members={members} />
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
      <MobileSidebar />
      <MobileBottomNav />
    </div>
  );
}
