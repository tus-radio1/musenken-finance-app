import { AppSidebar } from "@/components/app-sidebar";
import { createClient, createAdminClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { MembersTable, type MemberRow } from "@/components/members-table";

export default async function MembersManagementPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, student_number, grade")
    .order("grade", { ascending: false })
    .order("student_number", { ascending: true });

  const { data: allUserRoles } = await admin
    .from("user_roles")
    .select("user_id, roles(name, accounting_group_id)");

  const roleNamesByUser: Record<string, string[]> = {};
  (allUserRoles || []).forEach((row: any) => {
    const userId: string = row.user_id;
    const roles = row.roles;

    const addRoleName = (role: any) => {
      if (!role) return;
      if (role.accounting_group_id) return;
      const name: string | undefined = role.name;
      if (!name) return;
      const list = roleNamesByUser[userId] || [];
      if (!list.includes(name)) list.push(name);
      roleNamesByUser[userId] = list;
    };

    if (Array.isArray(roles)) roles.forEach(addRoleName);
    else addRoleName(roles);
  });

  const members: MemberRow[] = (profiles || []).map((profile: any) => {
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
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <main className="flex-1 flex flex-col p-6 overflow-y-auto">
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
    </div>
  );
}
