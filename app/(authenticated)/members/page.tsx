import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { MembersTable, type MemberRow } from "@/components/members-table";
import { ROLE_NAMES_JA } from "@/lib/roles/constants";
import { normalizeJoined } from "@/lib/roles/parse";
import { fetchMemberProfiles, type MemberProfileRow } from "@/lib/profiles";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";

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

    normalizeJoined(roles).forEach(addRoleName);
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
    <PageShell>
      <PageHeader
        title="部員情報一覧"
        description="登録されているメンバーの基本情報を一覧表示します。"
      />
      <Card>
        <CardContent>
          <MembersTable members={members} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
