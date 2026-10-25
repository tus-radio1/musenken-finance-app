import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { authPath, groups, localAdmin, openLedger, setupMetadata, transactionRow, uniqueDescription } from "./support";

test.use({ storageState: authPath("admin") });

test("admin soft-deletes a throwaway member, preserves ledger identity and blocks login", async ({ page, browser }) => {
  const admin = localAdmin();
  const metadata = await setupMetadata();
  // Every run owns fresh fixtures. Never delete or repurpose the six role accounts.
  const studentNumber = String(randomInt(9700000, 9800000));
  const name = uniqueDescription("Deleted member");
  const email = `${studentNumber}@ed.tus.ac.jp`;
  const password = randomBytes(24).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, app_metadata: { e2e_throwaway: true },
  });
  if (error) throw error;
  const userId = data.user.id;
  const anonymous = createClient(process.env.SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const loginContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const { error: profileError } = await admin.from("profiles").upsert({
      id: userId, name, student_number: studentNumber, grade: 1, deleted_at: null,
    });
    if (profileError) throw profileError;
    const { error: txError } = await admin.from("transactions").insert({
      id: randomUUID(), date: metadata.date, amount: -123, description: name,
      accounting_group_id: groups.open.id, fiscal_year_id: metadata.fiscalYear,
      financial_account_id: metadata.financialAccountId, created_by: userId,
      transaction_kind: "expense", approval_status: "pending",
    });
    if (txError) throw txError;
    expect((await anonymous.auth.signInWithPassword({ email, password })).error).toBeNull();
    await anonymous.auth.signOut();

    await page.goto("/members/manage");
    await page.getByPlaceholder("学籍番号で検索").fill(studentNumber);
    const row = page.getByRole("row").filter({ hasText: studentNumber });
    await expect(row).toContainText(name);
    await row.getByRole("button", { name: "削除", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "アカウント削除の確認" });
    await dialog.getByRole("button", { name: "削除してログインを停止", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toHaveCount(0);
    await page.goto("/members");
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);

    const { data: profile, error: readError } = await admin.from("profiles")
      .select("name, deleted_at").eq("id", userId).single();
    if (readError) throw readError;
    expect(profile.name).toBe(name);
    expect(profile.deleted_at).toBeTruthy();
    const { data: audit, error: auditError } = await admin.from("audit_logs")
      .select("id").eq("record_id", userId).eq("action", "SOFT_DELETE");
    if (auditError) throw auditError;
    expect(audit).toHaveLength(1);
    await openLedger(page, groups.open.name);
    await expect(transactionRow(page, name)).toContainText(name);
    // Inspect the creator cell separately: the description also contains name.
    await expect(transactionRow(page, name).getByRole("cell", { name, exact: true })).toHaveCount(2);

    const loginPage = await loginContext.newPage();
    await loginPage.goto("/login");
    await loginPage.getByLabel("学籍番号（7桁）").fill(studentNumber);
    await loginPage.getByLabel("パスワード", { exact: true }).fill(password);
    await loginPage.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(loginPage.getByText("学籍番号またはパスワードが正しくありません", { exact: true })).toBeVisible();
    await expect(loginPage).toHaveURL("/login");
    const denied = await anonymous.auth.signInWithPassword({ email, password });
    expect(denied.error?.code).toBe("user_banned");
  } finally {
    await loginContext.close();
    // Preserve all history even if an assertion fails; only this run's fixture
    // is stopped. A rerun creates a new member instead of resurrecting this one.
    const banned = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    if (banned.error) throw banned.error;
    const marked = await admin.from("profiles").update({ deleted_at: new Date().toISOString() })
      .eq("id", userId).is("deleted_at", null);
    if (marked.error) throw marked.error;
  }
});
