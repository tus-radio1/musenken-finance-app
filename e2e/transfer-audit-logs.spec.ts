import { test, expect } from "@playwright/test";
import {
  authPath, localAdmin, openLedger, setupMetadata, transactionRow, uniqueDescription,
} from "./support";

test.describe("accounting transfers and audit logs", () => {
  test.use({ storageState: authPath("accounting") });

  test("creates two approved club legs and views their INSERT audit entries", async ({ page }) => {
    const description = uniqueDescription("approved transfer");
    const metadata = await setupMetadata();
    const { data: wallets, error } = await localAdmin().from("financial_accounts")
      .select("id, name").eq("is_active", true).order("display_order");
    expect(error).toBeNull();
    const from = wallets!.find((wallet) => wallet.id === metadata.financialAccountId)!;
    const to = wallets!.find((wallet) => wallet.id !== from.id)!;
    expect(to).toBeTruthy();
    await openLedger(page, "部全体");
    await page.getByRole("button", { name: "資金移動", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "資金移動の登録" });
    await dialog.getByLabel("日付", { exact: true }).fill(metadata.date.replaceAll("-", "/"));
    await dialog.getByRole("combobox", { name: "移動元財布" }).click();
    await page.getByRole("option", { name: from.name, exact: true }).click();
    await dialog.getByRole("combobox", { name: "移動先財布" }).click();
    await page.getByRole("option", { name: to.name, exact: true }).click();
    await dialog.getByLabel("金額 (円)", { exact: true }).fill("321");
    await dialog.getByLabel("摘要", { exact: true }).fill(description);
    await dialog.getByRole("button", { name: "資金移動を登録", exact: true }).click();
    await expect(dialog).toBeHidden();
    const rows = transactionRow(page, description);
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) {
      await expect(row).toContainText("承認済");
      await expect(row).toContainText("資金移動");
      await expect(row.getByRole("button", { name: "メニューを開く", exact: true })).toHaveCount(0);
      await expect(row.getByRole("button", { name: "承認する", exact: true })).toHaveCount(0);
    }
    await expect(rows.filter({ hasText: from.name })).toHaveCount(1);
    await expect(rows.filter({ hasText: to.name })).toHaveCount(1);
    const { data: legs, error: readError } = await localAdmin().from("transactions")
      .select("amount, approval_status, transfer_id, approved_by, approved_at").eq("description", description);
    expect(readError).toBeNull();
    expect(legs).toHaveLength(2);
    expect(legs!.map((leg) => leg.amount).sort((a, b) => a - b)).toEqual([-321, 321]);
    expect(new Set(legs!.map((leg) => leg.transfer_id)).size).toBe(1);
    for (const leg of legs!) {
      expect(leg).toMatchObject({ approval_status: "approved", approved_by: metadata.userIds.accounting });
      expect(leg.approved_at).not.toBeNull();
    }

    await page.getByRole("link", { name: "変更履歴", exact: true }).click();
    await expect(page.getByRole("heading", { name: "変更履歴", exact: true })).toBeVisible();
    await page.getByLabel("対象", { exact: true }).selectOption("transactions");
    await page.getByLabel("操作", { exact: true }).selectOption("INSERT");
    await page.getByLabel("変更者", { exact: true }).selectOption(metadata.userIds.accounting);
    await page.getByRole("button", { name: "絞り込む", exact: true }).click();
    const entries = page.getByRole("list", { name: "変更履歴一覧" }).getByRole("listitem").filter({ hasText: description });
    await expect(entries).toHaveCount(2);
    for (const entry of await entries.all()) {
      await expect(entry).toContainText("登録");
      await expect(entry).toContainText("E2E Accounting");
      await entry.getByText(/変更内容（/).click();
      await expect(entry.getByText("approved", { exact: true })).toBeVisible();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "メニューを開く", exact: true }).click();
    await expect(page.getByRole("link", { name: "変更履歴", exact: true }).filter({ visible: true })).toBeVisible();
  });
});

test.describe("president transfer boundary", () => {
  test.use({ storageState: authPath("president") });
  test("部長 has no transfer button or audit navigation", async ({ page }) => {
    await openLedger(page, "部全体");
    await expect(page.getByRole("heading", { name: "部全体の出納帳", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "資金移動", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "変更履歴", exact: true })).toHaveCount(0);
  });
});

test.describe("member audit boundary", () => {
  test.use({ storageState: authPath("memberA") });
  test("member A gets AccessDenied on audit logs", async ({ page }) => {
    await page.goto("/audit-logs");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("アクセス権限がありません");
    await expect(page.getByRole("list", { name: "変更履歴一覧" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "変更履歴", exact: true })).toHaveCount(0);
  });
});
