import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  ManageMembersClient,
  type MemberManageRow,
} from "./_components/manage-members-client";
import type { RoleOption } from "./_components/edit-member-dialog";
import { requireRoleAccess } from "@/lib/roles/access";
import { normalizeJoined } from "@/lib/roles/parse";
import { canManageMembers, isAdmin } from "@/lib/roles/permissions";
import {
  fetchMemberProfiles,
  type MemberProfileRow,
} from "@/lib/profiles";

type RoleAssignment = {
  name?: string | null;
};

type UserRoleAssignmentRow = {
  role_id: string;
  roles: RoleAssignment | RoleAssignment[] | null;
  user_id: string;
};

export default async function MembersManagePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const access = await requireRoleAccess({ supabase, profileId: user.id });
  const hasAccess = canManageMembers(access);

  if (!hasAccess) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">
            アクセス権限がありません
          </h1>
          <p className="mt-2 text-muted-foreground">
            このページは部長・副部長・会計・Adminのみアクセス可能です。
          </p>
        </div>
      </main>
    );
  }

  // --- データ取得（RLS-respecting client）---
  const profiles = await fetchMemberProfiles(supabase);

  // 全ロール一覧
  const { data: rolesData } = await supabase
    .from("roles")
    .select("id, name")
    .order("name");

  const allRoles: RoleOption[] = (
    (rolesData as Array<{ id: string; name: string }> | null) || []
  ).map((r) => ({
    id: r.id,
    name: r.name,
  }));

  // 全ユーザーのロール割当取得
  const { data: allUserRoles } = await supabase
    .from("user_roles")
    .select("user_id, role_id, roles(name)");

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
    <main className="flex-1 flex flex-col p-6 pt-16 md:pt-6 pb-20 md:pb-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full">
        <Card>
          <CardHeader>
            <CardTitle>部員管理</CardTitle>
            <CardDescription>
              部員の追加・編集・退部処理・削除を行います。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ManageMembersClient members={members} allRoles={allRoles} isAdmin={actorIsAdmin} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
