import { getCurrentUser, getCurrentRoles } from "@/lib/auth/context";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import {
  ManageMembersClient,
  type MemberManageRow,
} from "./_components/manage-members-client";
import type { RoleOption } from "./_components/edit-member-dialog";
import { normalizeJoined } from "@/lib/roles/parse";
import { canManageMembers, isAdmin } from "@/lib/roles/permissions";
import {
  fetchMemberProfiles,
  type MemberProfileRow,
} from "@/lib/profiles";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { AccessDenied } from "@/components/feedback/access-denied";

type RoleAssignment = {
  name?: string | null;
};

type UserRoleAssignmentRow = {
  role_id: string;
  roles: RoleAssignment | RoleAssignment[] | null;
  user_id: string;
};

export default async function MembersManagePage() {
  const auth = await getCurrentUser();
  if (!auth) redirect("/login");
  const { supabase } = auth;

  const access = await getCurrentRoles();
  const hasAccess = canManageMembers(access);

  if (!hasAccess) {
    return (
      <PageShell>
        <PageHeader title="部員管理" />
        <AccessDenied description="このページは部長・副部長・会計・Adminのみアクセス可能です。" />
      </PageShell>
    );
  }

  const [profiles, { data: rolesData }, { data: allUserRoles }] = await Promise.all([
    fetchMemberProfiles(supabase),
    supabase.from("roles").select("id, name").order("name"),
    supabase.from("user_roles").select("user_id, role_id, roles(name)"),
  ]);

  const allRoles: RoleOption[] = (
    (rolesData as Array<{ id: string; name: string }> | null) || []
  ).map((r) => ({
    id: r.id,
    name: r.name,
  }));

  // ユーザーごとのロール情報をマップ
  const rolesByUser: Record<string, { names: string[]; ids: string[] }> = {};
  ((allUserRoles as UserRoleAssignmentRow[] | null) || []).forEach((ur) => {
    const userId: string = ur.user_id;
    const entry = rolesByUser[userId] || { names: [], ids: [] };
    normalizeJoined(ur.roles).forEach((role) => {
      if (role.name && !entry.names.includes(role.name)) {
        entry.names.push(role.name);
      }
    });
    if (ur.role_id && !entry.ids.includes(ur.role_id)) {
      entry.ids.push(ur.role_id);
    }
    rolesByUser[userId] = entry;
  });

  const members: MemberManageRow[] = profiles.map((p: MemberProfileRow) => {
    const userRoles = rolesByUser[p.id] || { names: [], ids: [] };
    return {
      id: p.id,
      name: p.name,
      student_number: p.student_number,
      grade: p.grade ?? 0,
      role_names: userRoles.names,
      role_ids: userRoles.ids,
    };
  });

  const actorIsAdmin = isAdmin(access);

  return (
    <PageShell>
      <PageHeader
        title="部員管理"
        description="部員の追加・編集・退部処理・削除を行います。"
      />
      <Card>
        <CardContent>
          <ManageMembersClient members={members} allRoles={allRoles} isAdmin={actorIsAdmin} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
