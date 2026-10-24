import { defineConfig, devices } from "@playwright/test";

// Override when port 3000 is taken by another local dev server.
const PORT = process.env.E2E_PORT ?? "3000";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    // Wait for Next.js readiness without probing an unopened local port.
    wait: { stdout: /Ready in/ },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
