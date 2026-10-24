import { test, expect } from "@playwright/test";
import {
  authPath, groups, localAdmin, openLedger, seedExpense, setupMetadata,
  transactionRow, uniqueDescription,
} from "./support";

for (const role of ["accounting", "admin"] as const) {
  test.describe(`${role} approval`, () => {
    test.use({ storageState: authPath(role) });

    test("approves another member's expense and persists it in the ledger", async ({ page }) => {
      const description = uniqueDescription(`${role} approval`);
      const id = await seedExpense("memberA", description);
      await openLedger(page, groups.team.name);
      const row = transactionRow(page, description);
      await expect(row).toBeVisible();
      const approve = row.getByRole("button", { name: "承認する", exact: true });
      await expect(approve).toBeVisible();
      await approve.click();
      await page.getByRole("alertdialog").getByRole("button", { name: "承認する", exact: true }).click();
      await expect(row).toContainText("承認済");
      await page.reload();
      await openLedger(page, groups.team.name);
      await expect(transactionRow(page, description)).toContainText("承認済");
      const { data, error } = await localAdmin().from("transactions")
        .select("approval_status, approved_by").eq("id", id).single();
      expect(error).toBeNull();
      expect(data).toEqual({ approval_status: "approved", approved_by: (await setupMetadata()).userIds[role] });
    });

    test("has no normal approval button on their own pending expense", async ({ page }) => {
      const description = uniqueDescription(`${role} own expense`);
      await seedExpense(role, description);
      await openLedger(page, groups.team.name);
      const row = transactionRow(page, description);
      await expect(row).toBeVisible();
      await expect(row).toContainText("受付中");
      await expect(row.getByRole("button", { name: "承認する", exact: true })).toHaveCount(0);
      await expect(row.getByRole("button", { name: "却下する", exact: true })).toHaveCount(0);
    });
  });
}

test.describe("leader permissions", () => {
  test.use({ storageState: authPath("leader") });

  test("leader cannot approve or edit another member's pending expense", async ({ page }) => {
    const description = uniqueDescription("leader boundary");
    await seedExpense("memberA", description);
    await openLedger(page, groups.team.name);
    const row = transactionRow(page, description);
    await expect(row).toBeVisible();
    await expect(row).toContainText("受付中");
    await expect(row.getByRole("button", { name: "承認する", exact: true })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "メニューを開く", exact: true })).toHaveCount(0);
  });
});

test.describe("president permissions", () => {
  test.use({ storageState: authPath("president") });

  test("部長 can read the club ledger without write controls", async ({ page }) => {
    const description = uniqueDescription("club read only");
    await seedExpense("admin", description, (await setupMetadata()).clubGroupId);
    await openLedger(page, "部全体");
    const row = transactionRow(page, description);
    await expect(row).toBeVisible();
    await expect(row).toContainText("受付中");
    await expect(row.getByRole("button", { name: "承認する", exact: true })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "メニューを開く", exact: true })).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("button", { name: /新規申請|新規取引|資金移動|振替|財布.*(追加|編集|管理)/ })).toHaveCount(0);
    // The application form must also exclude the read-only club group.
    await page.goto("/applications");
    await page.getByRole("button", { name: "＋ 新規申請", exact: true }).filter({ visible: true }).click();
    await page.getByRole("dialog").getByRole("combobox", { name: "会計グループ", exact: true }).click();
    await expect(page.getByRole("option", { name: "部全体", exact: true })).toHaveCount(0);
  });
});

test.describe("other member permissions", () => {
  test.use({ storageState: authPath("memberB") });

  for (const group of [groups.team, groups.open]) {
    test(`member B sees member A's ${group.type} row without edit or delete controls`, async ({ page }) => {
      const description = uniqueDescription(`${group.type} other member`);
      await seedExpense("memberA", description, group.id);
      await openLedger(page, group.name);
      const row = transactionRow(page, description);
      // Require the actual row, so missing data cannot make negative checks pass.
      await expect(row).toBeVisible();
      await expect(row).toContainText("受付中");
      await expect(row.getByRole("button", { name: "メニューを開く", exact: true })).toHaveCount(0);
      await expect(row.getByRole("button", { name: "承認する", exact: true })).toHaveCount(0);
      await expect(row.getByRole("menuitem", { name: /編集|削除/ })).toHaveCount(0);
    });
  }
});
