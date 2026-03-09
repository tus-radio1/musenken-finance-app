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
import {
  extractStudentNumberFromUser,
  findProfileIdByStudentNumber,
} from "@/lib/account";
import {
  ManageMembersClient,
  type MemberManageRow,
} from "./_components/manage-members-client";
import type { RoleOption } from "./_components/edit-member-dialog";

function extractRoleInfo(rows: any[] | null | undefined) {
  const names: string[] = [];
  const types: string[] = [];
  const pushRole = (role: any) => {
    const name = role?.name;
    const type = role?.type;
    if (name && !names.includes(name)) names.push(name);
    if (type && !types.includes(type)) types.push(type);
  };
  (rows || []).forEach((row) => {
    const roles = row?.roles;
    if (Array.isArray(roles)) roles.forEach(pushRole);
    else pushRole(roles);
  });
  return { names, types };
}

export default async function MembersManagePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const studentNumber = extractStudentNumberFromUser(user);
  const profileId = await findProfileIdByStudentNumber(supabase, studentNumber);

  let myRoleRows: any[] | null | undefined;
  if (profileId) {
    const { data } = await supabase
      .from("user_roles")
      .select("roles(name, type)")
      .eq("user_id", profileId);
    myRoleRows = data;
  }

  const roleInfo = extractRoleInfo(myRoleRows);
  const hasAccess =
    roleInfo.names.some((name) => ["部長", "副部長", "会計"].includes(name)) ||
    roleInfo.types.includes("admin");

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex h-screen">
          <AppSidebar />
          <div className="flex-1 flex flex-col">
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
          </div>
        </div>
      </div>
    );
  }

  // --- データ取得（Admin クライアントで RLS バイパス）---
  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, student_number, grade")
    .order("grade", { ascending: false })
    .order("student_number", { ascending: true });

  // 全ロール一覧
  const { data: rolesData } = await admin
    .from("roles")
    .select("id, name")
    .order("name");

  const allRoles: RoleOption[] = (rolesData || []).map((r: any) => ({
    id: r.id,
    name: r.name,
  }));

  // 全ユーザーのロール割当取得
  const { data: allUserRoles } = await admin
    .from("user_roles")
    .select("user_id, role_id, roles(name)");

  // ユーザーごとのロール情報をマップ
  const rolesByUser: Record<string, { names: string[]; ids: string[] }> = {};
  (allUserRoles || []).forEach((ur: any) => {
    const userId: string = ur.user_id;
    const role = ur.roles;
    if (!role) return;
    const entry = rolesByUser[userId] || { names: [], ids: [] };
    if (role.name && !entry.names.includes(role.name)) {
      entry.names.push(role.name);
    }
    if (ur.role_id && !entry.ids.includes(ur.role_id)) {
      entry.ids.push(ur.role_id);
    }
    rolesByUser[userId] = entry;
  });

  const members: MemberManageRow[] = (profiles || []).map((p: any) => {
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <main className="flex-1 flex flex-col p-6 overflow-y-auto">
            <div className="max-w-6xl mx-auto w-full">
              <Card>
                <CardHeader>
                  <CardTitle>部員管理</CardTitle>
                  <CardDescription>
                    部員の追加・編集・退部処理・削除を行います。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ManageMembersClient members={members} allRoles={allRoles} />
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
