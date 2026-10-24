import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect, type FullConfig } from "@playwright/test";
import type { User } from "@supabase/supabase-js";
import {
  authPath, groups, localAdmin, metadataPath, users,
  type SetupMetadata, type UserRole,
} from "./support";

export default async function globalSetup(config: FullConfig): Promise<void> {
  const admin = localAdmin();
  const password = process.env.E2E_PASSWORD || randomBytes(32).toString("base64url");
  await mkdir("e2e/.auth", { recursive: true, mode: 0o700 });

  const { error: groupError } = await admin.from("accounting_groups").upsert(
    Object.values(groups).map((group) => ({ ...group, is_active: true })),
  );
  if (groupError) throw groupError;

  const roles = [
    { id: "e2e00000-0000-4000-8000-000000000011", name: "E2E Member", type: "general", accounting_group_id: groups.team.id },
    { id: "e2e00000-0000-4000-8000-000000000012", name: "会計", type: "accounting", accounting_group_id: null },
    { id: "e2e00000-0000-4000-8000-000000000013", name: "E2E Admin", type: "admin", accounting_group_id: null },
    { id: "e2e00000-0000-4000-8000-000000000014", name: "部長", type: "general", accounting_group_id: null },
    { id: "e2e00000-0000-4000-8000-000000000015", name: "E2E Leader", type: "leader", accounting_group_id: groups.team.id },
  ];
  const { error: roleError } = await admin.from("roles").upsert(roles);
  if (roleError) throw roleError;
  const assignments: Record<UserRole, string[]> = {
    memberA: [roles[0].id], memberB: [roles[0].id],
    // The current non-club INSERT policy also requires a group assignment for
    // accounting; keep this realistic membership without granting admin rights.
    accounting: [roles[1].id, roles[0].id], admin: [roles[2].id],
    president: [roles[3].id], leader: [roles[4].id],
  };

  const existingUsers: User[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    existingUsers.push(...data.users);
    if (data.users.length < 100) break;
  }
  const userIds = {} as Record<UserRole, string>;
  for (const role of Object.keys(users) as UserRole[]) {
    const user = users[role];
    const email = `${user.studentNumber}@ed.tus.ac.jp`;
    const existing = existingUsers.find((entry) => entry.email === email);
    if (existing && existing.app_metadata.e2e !== true) {
      throw new Error(`Refusing to overwrite a non-E2E account: ${role}`);
    }
    const result = existing
      ? await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
      : await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { e2e: true } });
    if (result.error) throw result.error;
    const id = result.data.user.id;
    userIds[role] = id;
    const { error: profileError } = await admin.from("profiles").upsert({
      id, name: user.name, student_number: user.studentNumber, grade: 2, deleted_at: null,
    });
    if (profileError) throw profileError;
    const { error: clearError } = await admin.from("user_roles").delete().eq("user_id", id);
    if (clearError) throw clearError;
    const { error: assignmentError } = await admin.from("user_roles").insert(
      assignments[role].map((roleId) => ({ user_id: id, role_id: roleId })),
    );
    if (assignmentError) throw assignmentError;
  }

  // Account ownership was checked above. Delete only these six E2E account
  // hashes and user IDs, so repeated suites do not inherit fixed-window limits.
  const hash = (key: string): string => createHash("sha256").update(key).digest("hex");
  for (const [bucket, keys] of [
    ["login-account", Object.values(users).map((user) => user.studentNumber)],
    ["upload", Object.values(userIds)],
  ] as const) {
    const { error } = await admin.from("rate_limit_hits").delete()
      .eq("bucket", bucket).in("key_hash", keys.map(hash));
    if (error) throw error;
  }

  const { data: fy, error: fyError } = await admin.from("fiscal_years")
    .select("year, start_date").eq("is_current", true).single();
  if (fyError) throw fyError;
  const { data: wallet, error: walletError } = await admin.from("financial_accounts")
    .select("id").eq("type", "cash").eq("is_active", true).order("display_order").limit(1).single();
  if (walletError) throw walletError;
  const { data: club, error: clubError } = await admin.from("accounting_groups")
    .select("id").eq("type", "club").single();
  if (clubError) throw clubError;
  const metadata: SetupMetadata = {
    userIds, fiscalYear: fy.year, date: fy.start_date,
    financialAccountId: wallet.id, clubGroupId: club.id,
  };
  await writeFile(metadataPath, JSON.stringify(metadata), { mode: 0o600 });

  const browser = await chromium.launch();
  // A fresh documentation-range IP per run avoids clearing any shared IP row.
  // All six accounts share this bucket, within the 20-attempt/IP limit.
  const clientIp = `2001:db8:${randomBytes(10).toString("hex").match(/.{4}/g)!.join(":")}:1`;
  try {
    for (const role of Object.keys(users) as UserRole[]) {
      const context = await browser.newContext({
        baseURL: config.projects[0].use.baseURL,
        extraHTTPHeaders: { "x-forwarded-for": clientIp },
      });
      try {
        const page = await context.newPage();
        await page.goto("/login");
        await page.getByLabel("学籍番号（7桁）").fill(users[role].studentNumber);
        await page.getByLabel("パスワード", { exact: true }).fill(password);
        await page.getByRole("button", { name: "ログイン", exact: true }).click();
        await expect(page).toHaveURL(`${config.projects[0].use.baseURL}/`);
        await expect(page.getByRole("main")).toBeVisible();
        await context.storageState({ path: authPath(role) });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
