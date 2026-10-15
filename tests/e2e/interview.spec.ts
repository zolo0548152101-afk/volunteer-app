import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";

try { process.loadEnvFile(".env.local"); } catch {}

const STUDENT = "student5@demo.test"; // ליאן, ממתינה לראיון בנתוני הדמו

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill("demo1234");
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function reset() {
  if (!process.env.DATABASE_URL) return;
  const { db, closeDb } = await import("../../lib/db");
  const s = sql`(SELECT id FROM users WHERE email = ${STUDENT})`;
  await db().execute(sql`DELETE FROM placements WHERE student_id = ${s}`);
  await db().execute(sql`DELETE FROM interviews WHERE student_id = ${s}`);
  await db().execute(sql`UPDATE users SET coordinator_id = NULL WHERE email = ${STUDENT}`);
  await closeDb();
}

test.beforeAll(reset);
test.afterAll(reset);

test("מראיין רואה את התור, מנהל מראיין ומשבץ סטודנטית", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "הבדיקה משנה נתוני דמו משותפים, רצה פעם אחת");
  await login(page, "interviewer@demo.test");
  await expect(page.getByRole("heading", { name: "ממתינים לראיון" })).toBeVisible();
  await expect(page.getByRole("link", { name: /ליאן/ })).toBeVisible();
  await page.getByRole("button", { name: "יציאה" }).click();
  await expect(page).toHaveURL(/\/login/);

  await login(page, "manager@demo.test");
  await page.goto("/students");
  await page.getByRole("link", { name: /ליאן/ }).click();
  await page.getByRole("button", { name: "פתיחת ראיון" }).click();
  await expect(page).toHaveURL(/\/interviews\//);

  // הוספת החלון הראשון שמוצע, ושמירת טיוטה
  await page.getByRole("button", { name: "הוספה לחוזה" }).first().click();
  await expect(page.getByLabel("תקנים")).toBeVisible();
  await page.getByRole("button", { name: "שמירת טיוטה" }).click();
  await expect(page.getByText("שני הבנקים")).toBeVisible();

  await page.getByLabel("רכז לסטודנט").selectOption({ index: 1 });
  const reason = page.getByLabel(/סיבה לאישור החריגה/);
  if (await reason.count()) await reason.fill("בדיקת e2e");
  await page.getByRole("button", { name: "סגירת הראיון ושיבוץ" }).click();

  await expect(page).toHaveURL(/\/students\/.+done=1/, { timeout: 30_000 });
  await expect(page.getByText("הראיון נסגר והסטודנט שובץ")).toBeVisible();
  await expect(page.getByRole("heading", { name: "שיבוצים פעילים" })).toBeVisible();
  await expect(page.getByRole("button", { name: "שיבוץ מחדש" })).toBeVisible();
});
