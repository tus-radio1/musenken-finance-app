import { test, expect } from "@playwright/test";
import { authPath, submitExpense, uniqueDescription } from "./support";

test.use({ storageState: authPath("memberA") });

for (const filename of ["receipt.pdf", "receipt.png"]) {
  test(`member submits an expense with ${filename} and opens its signed receipt`, async ({ page }) => {
    const description = uniqueDescription(filename);
    const row = await submitExpense(page, description, filename);
    const link = row.getByRole("link", { name: "表示", exact: true });
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/api\/receipts\?path=/);
    // Use this browser's cookies, inspect the actual 302, then fetch its target.
    const response = await page.request.get(href!, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    const location = response.headers().location;
    expect(location).toContain("/storage/v1/object/sign/receipts/");
    const receipt = await page.request.get(location);
    expect(receipt.ok()).toBe(true);
    expect((await receipt.body()).length).toBeGreaterThan(0);
    expect(receipt.headers()["content-type"]).toMatch(filename.endsWith(".pdf") ? /application\/pdf/ : /image\//);
  });
}
