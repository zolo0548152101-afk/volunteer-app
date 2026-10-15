import { expect, test, type Page } from "@playwright/test";
import { sql } from "drizzle-orm";

try { process.loadEnvFile(".env.local"); } catch {}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill("demo1234");
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test.afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const { db, closeDb } = await import("../../lib/db");
  await db().execute(sql`DELETE FROM place_time_windows WHERE place_id IN (SELECT id FROM volunteer_places WHERE name LIKE 'e2e %')`);
  await db().execute(sql`DELETE FROM volunteer_places WHERE name LIKE 'e2e %'`);
  await closeDb();
});

test("מנהל יוצר מקום וחלון זמן ורואה תפוסה מחושבת", async ({ page }) => {
  const name = `e2e מקום ${Date.now()}`;
  await login(page, "manager@demo.test");
  await page.goto("/places");
  await page.getByLabel("שם המקום").fill(name);
  await page.getByLabel("איש קשר", { exact: true }).fill("דנה לוי");
  await page.getByRole("button", { name: "יצירת מקום" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "הוספת חלון" }) });
  await form.getByLabel("שם החלון").fill("ראשון בוקר");
  await form.getByLabel("ראשון", { exact: true }).check();
  await form.getByLabel("מספר תקנים").fill("1.5");
  await form.getByLabel("שעות שבועיות לתקן").fill("4");
  await form.getByRole("button", { name: "הוספת חלון" }).click();
  await expect(page.getByText("1.5 תקנים × 4 ש' = 6 ש'")).toBeVisible();
  await expect(page.getByText("איש קשר: דנה לוי")).toBeVisible();

});

test("סטודנט רואה מקום בלי איש קשר ובלי קיבולת", async ({ page }) => {
  await login(page, "student1@demo.test");
  await page.goto("/places");
  await expect(page.getByRole("heading", { name: "מקומות התנדבות", level: 1 })).toBeVisible();
  await expect(page.getByText("שעות שבועיות מבוקשות")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "יצירת מקום" })).toHaveCount(0);
  await page.locator("main ul a").first().click();
  await expect(page.getByText("איש קשר")).toHaveCount(0);
  await expect(page.getByText("שעות מבוקשות")).toHaveCount(0);
});

test("רכז רואה תפוסה אבל לא טפסי עריכה", async ({ page }) => {
  await login(page, "coord1@demo.test");
  await page.goto("/places");
  await expect(page.getByText("שעות שבועיות מבוקשות").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "יצירת מקום" })).toHaveCount(0);
});
