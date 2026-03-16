import { createClient, createAdminClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserRoleManager } from "./_components/user-role-manager";
import { TeamManager } from "./_components/team-manager";
import { CreateUserForm } from "./_components/create-user-form";
import { ResetPasswordButton } from "./_components/reset-password-button";
import {
  extractStudentNumberFromUser,
  findProfileIdByStudentNumber,
} from "@/lib/account";

function extractRoleNames(rows: any[] | null | undefined) {
  const names: string[] = [];
  const pushName = (role: any) => {
    const name = role?.name;
    if (name && !names.includes(name)) names.push(name);
  };
  (rows || []).forEach((row) => {
    const roles = row?.roles;
    if (Array.isArray(roles)) roles.forEach(pushName);
    else pushName(roles);
  });
  return names;
}

export default async function AdminUsersPage() {
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
      .select("roles(name)")
      .eq("user_id", profileId);
    myRoleRows = data;
  }

  const myRoleNames = extractRoleNames(myRoleRows);
  const hasAccess = myRoleNames.some((name) =>
    ["会計", "部長", "副部長"].includes(name)
  );

  if (!hasAccess) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">
            アクセス権限がありません
          </h1>
          <p>このページは会計・部長・副部長のみアクセス可能です。</p>
        </div>
      </div>
    );
  }

  // 管理者であれば全ユーザー情報の取得はAdminクライアントで行う（RLSをバイパス）
  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, student_number")
    .order("updated_at", { ascending: false });

  // チーム連携UIは別途対応予定
  // 会計グループ一覧
  const { data: accountingGroups } = await supabase
    .from("accounting_groups")
    .select("id, name")
    .order("name");

  // 全ユーザーのロール取得
  const { data: allUserRoles } = await admin
    .from("user_roles")
    .select("user_id, roles(type, accounting_group_id)");

  const rolesByUser: Record<
    string,
    Array<{ type: string; accounting_group_id: string | null }>
  > = {};
  (allUserRoles || []).forEach((ur: any) => {
    const userId: string = ur.user_id;
    const roles = ur.roles;

    const addRole = (role: any) => {
      if (!role) return;
      const arr = rolesByUser[userId] || [];
      arr.push({
        type: role.type,
        accounting_group_id: role.accounting_group_id,
      });
      rolesByUser[userId] = arr;
    };

    if (Array.isArray(roles)) roles.forEach(addRole);
    else addRole(roles);
  });

  return (
    <div className="min-h-screen bg-background/50">
      <main className="container mx-auto py-10 max-w-6xl">
        <Card>
          <CardHeader>
            <CardTitle>ユーザー管理</CardTitle>
            <CardDescription>
              権限の変更や班への割り当てを行います。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateUserForm />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名前 / 学籍番号</TableHead>
                  <TableHead>グローバル権限</TableHead>
                  <TableHead>所属チーム (役割)</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles?.map((profile: any) => (
                  <TableRow key={profile.id}>
                    <TableCell>
                      <div className="font-medium">{profile.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {profile.student_number}
                      </div>
                    </TableCell>
                    <TableCell>
                      <UserRoleManager
                        userId={profile.id}
                        isAdmin={(rolesByUser[profile.id] || []).some(
                          (r) => r.type === "admin"
                        )}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {/* チーム表示は今後の更新にて対応 */}
                        {(!profile.team_members ||
                          (rolesByUser[profile.id] || []).filter(
                            (r) => r.accounting_group_id
                          ).length === 0) && (
                          <span className="text-gray-300 text-sm">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <ResetPasswordButton
                          userId={profile.id}
                          studentNumber={profile.student_number}
                        />
                        <TeamManager
                          userId={profile.id}
                          currentTeams={(rolesByUser[profile.id] || [])
                            .filter((r) => r.accounting_group_id)
                            .map((r) => {
                              const g = (accountingGroups || []).find(
                                (ag: any) => ag.id === r.accounting_group_id
                              );
                              return {
                                id: r.accounting_group_id as string,
                                name: g?.name || "",
                                type: r.type as "general" | "leader",
                              };
                            })}
                          allCategories={(accountingGroups || []).map(
                            (ag: any) => ({ id: ag.id, name: ag.name })
                          )}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
