import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";
import { login } from "./helpers";

try { process.loadEnvFile(".env.local"); } catch {}

test.afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const { db, closeDb } = await import("../../lib/db");
  await db().execute(sql`DELETE FROM audit_log WHERE actor_id IN (SELECT id FROM users WHERE email LIKE 'e2e-reg-%') OR entity_id IN (SELECT id FROM users WHERE email LIKE 'e2e-reg-%')`);
  await db().execute(sql`DELETE FROM custom_field_values WHERE entity_id IN (SELECT id FROM users WHERE email LIKE 'e2e-reg-%')`);
  await db().execute(sql`DELETE FROM student_profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'e2e-reg-%')`);
  await db().execute(sql`DELETE FROM notification_log WHERE recipient_id IN (SELECT id FROM users WHERE email LIKE 'e2e-reg-%')`);
  await db().execute(sql`DELETE FROM users WHERE email LIKE 'e2e-reg-%'`);
  await closeDb();
});

async function fillApplication(page: import("@playwright/test").Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("שם פרטי").fill("נועה");
  await page.getByLabel("שם משפחה").fill("בדיקה");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("טלפון נייד").fill("050-123-4567");
  await page.getByLabel("תעודת זהות").fill("123456782");
  await page.getByLabel("מוסד לימודים").fill("אוניברסיטת חיפה");
  await page.getByLabel("סוג תואר").selectOption("bachelor");
  await page.getByLabel("מספר חשבון").fill("12345678");
}

test("טופס פתוח: שליחה בלי חשבון, אחר כך מופיע בתור של המראיין, ואי אפשר להיכנס", async ({ page }) => {
  const email = `e2e-reg-${Date.now()}@demo.test`;
  await fillApplication(page, email);
  await page.getByRole("button", { name: "שליחת הרשמה" }).click();
  await expect(page).toHaveURL(/\/register\/thanks$/);
  await expect(page.getByText("מראיין ייצור איתך קשר")).toBeVisible();

  // אין סיסמה: הכניסה נכשלת, ו"שכחתי סיסמה" לא עוקף את הראיון
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill("anything123");
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page).toHaveURL(/\/login/);

  await login(page, "interviewer@demo.test");
  await page.goto("/interviewer");
  await expect(page.getByText("נועה בדיקה")).toBeVisible();
});

test("הגשה עם מייל קיים: אותו עמוד תודה, בלי לחשוף שהמייל רשום", async ({ page }) => {
  await fillApplication(page, "student1@demo.test");
  await page.getByRole("button", { name: "שליחת הרשמה" }).click();
  await expect(page).toHaveURL(/\/register\/thanks$/);
});

test("אין גלילה אופקית בהרשמה", async ({ page }) => {
  await page.goto("/register");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
