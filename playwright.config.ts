import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  webServer: {
    // build לפני ההרצה: אחרת הבדיקות רצות בשקט מול .next ישן
    command: "pnpm build && pnpm start -p 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    timeout: 240_000,
    // כל הכניסות בבדיקות מגיעות מאותה כתובת, אז הגבלת הקצב כבויה כאן (נבדקת בבדיקות האינטגרציה)
    env: { DISABLE_RATE_LIMIT: "1", CRON_SECRET: "e2e-cron-secret" },
  },
  use: {
    trace: "retain-on-failure",
    baseURL: "http://localhost:3100",
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
