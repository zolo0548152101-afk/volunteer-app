import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";
import { login } from "./helpers";

try { process.loadEnvFile(".env.local"); } catch {}

const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });

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
  // רק שלושה שדות גלויים; שעות והערות מקופלות
  await expect(page.getByLabel("שיבוץ")).toBeVisible();
  await expect(page.getByLabel("תאריך")).toBeVisible();
  await expect(page.locator("input[name=reportedHours]")).toBeVisible();
  await expect(page.getByLabel("הערות")).toBeHidden();
  await page.getByLabel("תאריך").fill(yesterday);
  await page.locator("input[name=reportedHours]").fill("3");
  await page.getByText("עוד פרטים").click();
  await page.getByLabel("הערות").fill("e2e-report");
  await page.getByRole("button", { name: "שליחה לאישור" }).click();
  await expect(page).toHaveURL(/\/student\/reports\?sent=1/);
  await expect(page.getByText("ממתין לאישור").first()).toBeVisible();

  // כפילות ביום הזה: הודעה עניינית, הטופס נשאר
  await page.goto("/student/report");
  await page.getByLabel("תאריך").fill(yesterday);
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

test("בית הסטודנט: התקדמות, חוזה, כפתור דיווח ודיווחים אחרונים", async ({ page }) => {
  await login(page, "student1@demo.test");
  await page.goto("/student");
  await expect(page.getByRole("main").getByRole("link", { name: /דיווח שעות/ })).toBeVisible();
  await expect(page.getByRole("progressbar")).toBeVisible();
  await expect(page.getByRole("heading", { name: "החוזה שלך" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "הדיווחים האחרונים" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("טופס הדיווח: מתג היעדרות מחליף את השיבוץ בסיבה", async ({ page }) => {
  await login(page, "student1@demo.test");
  await page.goto("/student/report");
  await expect(page.getByLabel("שיבוץ")).toBeVisible();
  await page.getByLabel("זה דיווח על היעדרות").check();
  await expect(page.getByLabel("סיבת ההיעדרות")).toBeVisible();
  await expect(page.getByLabel("שיבוץ")).toBeHidden();
});

test("תיבת הרכז: מסננים ואישור מרובה מוצגים; הצ'קבוקס נגיש בשם הסטודנט", async ({ page }) => {
  await login(page, "coord1@demo.test");
  await page.goto("/reports");
  await expect(page.getByLabel("סטודנט", { exact: true })).toBeVisible();
  await expect(page.getByLabel("מקום", { exact: true })).toBeVisible();
  await expect(page.getByLabel("חודש", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "אישור המסומנים בשעות שדווחו" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /בחירה לאישור מרובה/ }).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
