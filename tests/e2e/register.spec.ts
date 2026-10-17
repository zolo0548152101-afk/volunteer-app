import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";

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

test("הרשמת סטודנט מקצה לקצה, ואז הפרופיל שלי", async ({ page }) => {
  const email = `e2e-reg-${Date.now()}@demo.test`;
  await page.goto("/register");
  await page.getByLabel("שם פרטי").fill("נועה");
  await page.getByLabel("שם משפחה").fill("בדיקה");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("טלפון נייד").fill("050-123-4567");
  await page.getByLabel("סיסמה (לפחות 8 תווים)").fill("longenough1");
  await page.getByLabel("אימות סיסמה").fill("longenough1");
  await page.getByRole("button", { name: "המשך" }).click();

  await expect(page).toHaveURL(/\/student\/setup\/1$/);
  await expect(page.getByText("שלב 1 מתוך 3")).toBeVisible();
  // ת"ז לא תקינה: הדפדפן חוסם לפני שליחה, ולא מאבדים את מה שהוקלד
  await page.getByLabel("תעודת זהות").fill("123456789");
  await page.getByLabel("מוסד לימודים").fill("אוניברסיטת חיפה");
  await page.getByLabel("סוג תואר").selectOption("bachelor");
  await page.getByRole("button", { name: "המשך" }).click();
  await expect(page).toHaveURL(/\/student\/setup\/1$/);
  expect(await page.getByLabel("תעודת זהות").evaluate((el: HTMLInputElement) => el.validationMessage)).toContain("תעודת הזהות לא תקין");
  await expect(page.getByLabel("מוסד לימודים")).toHaveValue("אוניברסיטת חיפה");
  await page.getByLabel("תעודת זהות").fill("123456782");
  await page.getByRole("button", { name: "המשך" }).click();

  await expect(page).toHaveURL(/\/student\/setup\/2$/);
  await page.getByLabel("שני", { exact: true }).check();
  await page.getByRole("button", { name: "המשך" }).click();

  await expect(page).toHaveURL(/\/student\/setup\/3$/);
  await page.getByLabel("מספר חשבון").fill("12345678");
  await page.getByRole("button", { name: "סיום ההרשמה" }).click();

  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByText("מחכים שמראיין ייצור איתך קשר")).toBeVisible();

  await page.goto("/student/profile");
  await expect(page.getByLabel("תעודת זהות")).toHaveValue("123456782");
  await expect(page.getByLabel("שני", { exact: true })).toBeChecked();
  await page.getByLabel("עיר מגורים").first().fill("חיפה");
  await page.getByRole("button", { name: "שמירה" }).first().click();
  await expect(page.getByLabel("עיר מגורים")).toHaveValue("חיפה");
});

test("הרשמה עם מייל קיים: הודעה ברורה", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("שם פרטי").fill("א");
  await page.getByLabel("שם משפחה").fill("ב");
  await page.getByLabel("אימייל").fill("student1@demo.test");
  await page.getByLabel("טלפון נייד").fill("0501234567");
  await page.getByLabel("סיסמה (לפחות 8 תווים)").fill("longenough1");
  await page.getByLabel("אימות סיסמה").fill("longenough1");
  await page.getByRole("button", { name: "המשך" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("כבר רשום");
});

test("אין גלילה אופקית בהרשמה", async ({ page }) => {
  await page.goto("/register");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
