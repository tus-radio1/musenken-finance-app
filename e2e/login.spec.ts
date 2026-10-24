import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { authPath, users } from "./support";

test("unauthenticated home redirects to login and a bad password shows an error", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/login");
  await page.getByLabel("学籍番号（7桁）").fill(users.memberA.studentNumber);
  await page.getByLabel("パスワード", { exact: true }).fill(`invalid-${randomUUID()}`);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByText("学籍番号またはパスワードが正しくありません", { exact: true })).toBeVisible();
  await expect(page).toHaveURL("/login");
});

test.describe("session created by the real login form in global setup", () => {
  test.use({ storageState: authPath("memberA") });

  test("successful login persists and redirects login to the app", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("main")).toBeVisible();
    await page.goto("/applications");
    await expect(page.getByRole("heading", { name: "経費申請", exact: true })).toBeVisible();
  });
});
