import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";

try { process.loadEnvFile(".env.local"); } catch {}

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill("demo1234");
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function cleanup() {
  if (!process.env.DATABASE_URL) return;
  const { db, closeDb } = await import("../../lib/db");
  await db().execute(sql`DELETE FROM audit_log WHERE entity = 'hour_report' AND entity_id IN (SELECT id FROM hour_reports WHERE student_notes = 'e2e-report')`);
  await db().execute(sql`DELETE FROM hour_reports WHERE student_notes = 'e2e-report'`);
  await closeDb();
}
test.beforeAll(cleanup);
test.afterAll(cleanup);

test("סטודנט מדווח, רכז מאשר עם שינוי שעות, הסטודנט רואה", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "משנה נתוני דמו משותפים, רץ פעם אחת");
  await login(page, "student2@demo.test");
  await page.goto("/student/report");
  await expect(page.getByLabel("שעות")).not.toHaveValue("");
  await page.getByLabel("תאריך").fill("2026-10-14");
  await page.getByLabel("שעות").fill("3");
  await page.getByLabel("הערות").fill("e2e-report");
  await page.getByRole("button", { name: "שליחה לאישור" }).click();
  await expect(page).toHaveURL(/\/student\/reports\?sent=1/);
  await expect(page.getByText("ממתין לאישור").first()).toBeVisible();

  // כפילות ביום הזה: הודעה עניינית, הטופס נשאר
  await page.goto("/student/report");
  await page.getByLabel("תאריך").fill("2026-10-14");
  await page.getByRole("button", { name: "שליחה לאישור" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("כבר דיווחת");
  await page.getByRole("button", { name: "יציאה" }).click();
  await expect(page).toHaveURL(/\/login/);

  await login(page, "coord1@demo.test");
  await page.goto("/reports");
  const card = page.locator("li", { hasText: "e2e-report" });
  await expect(card).toBeVisible();
  // דחייה בלי סיבה נחסמת בשירות
  await card.getByRole("button", { name: "דחייה" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("נדרשת סיבה");
  await page.locator("li", { hasText: "e2e-report" }).getByLabel("שעות לאישור").fill("2.5");
  await page.locator("li", { hasText: "e2e-report" }).getByRole("button", { name: "אישור", exact: true }).click();
  await expect(page.locator("li", { hasText: "e2e-report" })).toHaveCount(0);
  await page.goto("/reports?status=approved");
  await expect(page.locator("li", { hasText: "e2e-report" })).toContainText("אושר: 2.5");
  await page.getByRole("button", { name: "יציאה" }).click();
  await expect(page).toHaveURL(/\/login/);

  await login(page, "student2@demo.test");
  await page.goto("/student/reports");
  await expect(page.getByText("אושרו 2.5 ש'")).toBeVisible();
});

test("רכז אחר ומראיין לא רואים את תיבת הדיווחים של רכז 1", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop");
  await login(page, "interviewer@demo.test");
  await page.goto("/reports");
  await expect(page).not.toHaveURL(/\/reports/);
});
