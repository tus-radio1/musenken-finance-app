import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Locator, type Page } from "@playwright/test";
import type { Database } from "../lib/database.types";

export const groups = {
  team: { id: "e2e00000-0000-4000-8000-000000000001", name: "E2E Team", type: "team" },
  open: { id: "e2e00000-0000-4000-8000-000000000002", name: "E2E Open", type: "general" },
} as const;

export const users = {
  memberA: { studentNumber: "9900001", name: "E2E Member A" },
  memberB: { studentNumber: "9900002", name: "E2E Member B" },
  accounting: { studentNumber: "9900003", name: "E2E Accounting" },
  admin: { studentNumber: "9900004", name: "E2E Admin" },
  president: { studentNumber: "9900005", name: "E2E President" },
  leader: { studentNumber: "9900006", name: "E2E Leader" },
} as const;
export type UserRole = keyof typeof users;
export const authPath = (role: UserRole): string => path.resolve("e2e/.auth", `${role}.json`);
export const metadataPath = path.resolve("e2e/.auth/metadata.json");

export type SetupMetadata = {
  userIds: Record<UserRole, string>;
  fiscalYear: number;
  date: string;
  financialAccountId: string;
  clubGroupId: string;
};

// Refuse remote credentials before making any admin API call. Public build-time
// values must point at this same local stack; .env.local is intentionally not read.
export function localAdmin(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Export local SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first");
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) {
    throw new Error("E2E admin access is restricted to the local Supabase stack");
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== url || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Export matching local NEXT_PUBLIC_SUPABASE_* values before building and testing");
  }
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function setupMetadata(): Promise<SetupMetadata> {
  return JSON.parse(await readFile(metadataPath, "utf8")) as SetupMetadata;
}

export function uniqueDescription(label: string): string {
  return `E2E ${label} ${randomUUID()}`;
}

export function transactionRow(page: Page, description: string): Locator {
  return page.getByRole("row").filter({ hasText: description });
}

export async function openLedger(page: Page, groupName: string): Promise<void> {
  await page.goto("/ledger");
  await page.getByRole("heading", { level: 1 }).getByRole("combobox").click();
  await page.getByRole("option", { name: groupName, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(groupName);
}

// Prepare an independent pending row; authorization and approval are exercised
// through the UI. Every test owns a unique row, including retries and reruns.
export async function seedExpense(
  owner: UserRole,
  description: string,
  groupId: string = groups.team.id,
): Promise<string> {
  const admin = localAdmin();
  const metadata = await setupMetadata();
  const id = randomUUID();
  const { error } = await admin.from("transactions").insert({
    id,
    date: metadata.date,
    amount: -1234,
    description,
    accounting_group_id: groupId,
    fiscal_year_id: metadata.fiscalYear,
    financial_account_id: metadata.financialAccountId,
    created_by: metadata.userIds[owner],
    transaction_kind: "expense",
    approval_status: "pending",
  });
  if (error) throw error;
  return id;
}

export async function submitExpense(page: Page, description: string, filename: string): Promise<Locator> {
  const metadata = await setupMetadata();
  await page.goto("/applications");
  await page.getByRole("button", { name: "＋ 新規申請", exact: true }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog", { name: "新規取引の登録" });
  await dialog.getByLabel("日付", { exact: true }).fill(metadata.date.replaceAll("-", "/"));
  await dialog.getByLabel("金額 (円)", { exact: true }).fill("1234");
  await dialog.getByRole("combobox", { name: "会計グループ", exact: true }).click();
  await page.getByRole("option", { name: groups.team.name, exact: true }).click();
  await dialog.getByLabel("概要", { exact: true }).fill(description);
  // The shared dropzone exposes its hidden file input through aria-labelledby.
  // Do not click the dropzone, which would open the native file picker.
  const receiptInput = dialog.getByLabel("領収書データ (任意)", { exact: true })
    .and(dialog.locator('input[type="file"]'));
  await expect(receiptInput).toHaveCount(1);
  await receiptInput.setInputFiles(path.resolve("e2e/fixtures", filename));
  await expect(dialog.getByText(filename, { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "登録する", exact: true }).click();
  await expect(dialog).toBeHidden();
  const row = transactionRow(page, description);
  await expect(row).toBeVisible();
  await expect(row).toContainText("受付中");
  return row;
}
