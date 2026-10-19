import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";
import { login, logout } from "./helpers";

try { process.loadEnvFile(".env.local"); } catch {}

const STUDENT = "student5@demo.test"; // ליאן, ממתינה לראיון בנתוני הדמו

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
  await logout(page);
  await expect(page).toHaveURL(/\/login/);

  await login(page, "manager@demo.test");
  await page.goto("/students");
  await page.getByRole("link", { name: /ליאן/ }).click();
  await page.getByRole("button", { name: "פתיחת ראיון" }).click();
  await expect(page).toHaveURL(/\/interviews\//);

  // הוספת החלון הראשון שמוצע, ושמירת טיוטה
  // חיפוש חי ברשימת המקומות הפנויים, בלי כפתור סינון
  const search = page.getByRole("searchbox", { name: "חיפוש" });
  await search.fill("zzzz-אין-כזה");
  await expect(page.getByText("לא נמצא מקום פנוי שמתאים לחיפוש")).toBeVisible();
  await search.fill("");
  // הוספה בתוך השורה: קודם משחקים עם התקנים והשעות, אחר כך מוסיפים
  await page.getByRole("button", { name: /^הוספה:/ }).first().click();
  await page.getByRole("button", { name: "הוספה לשיבוץ" }).click();
  const line = page.getByRole("region", { name: /המקומות של ליאן/ }).getByRole("listitem").first();
  await expect(line.getByLabel("תקנים")).toBeVisible();
  // תחזית חיה: שינוי התקנים מעדכן את החריגה ואת השעות עד סוף השנה לפני שמירה
  const slots = line.getByLabel("תקנים");
  const original = await slots.inputValue();
  await slots.fill("999");
  await expect(line.getByText(/אין מספיק תקנים פנויים/)).toBeVisible();
  await slots.fill(original);
  await expect(line.getByText(/אין מספיק תקנים פנויים/)).toBeHidden();
  await expect(page.getByText("יש שינויים שעוד לא נשמרו")).toBeVisible();

  await page.getByRole("button", { name: "שמירת טיוטה" }).click();
  await expect(page.getByRole("heading", { name: "שעות עד סוף השנה" })).toBeVisible();
  await expect(page.getByText("יש שינויים שעוד לא נשמרו")).toBeHidden();
  // נגישות מסך הראיון (המסך המורכב ביותר)
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);

  await page.getByLabel("רכז לסטודנט").selectOption({ index: 1 });
  const reason = page.getByLabel(/סיבה לאישור החריגה/);
  if (await reason.count()) await reason.fill("בדיקת e2e");
  await page.getByRole("button", { name: "סגירת הראיון ושיבוץ" }).click();

  await expect(page).toHaveURL(/\/students\/.+done=1/, { timeout: 30_000 });
  await expect(page.getByText("הראיון נסגר והסטודנט שובץ")).toBeVisible();
  await expect(page.getByRole("heading", { name: "שיבוצים פעילים" })).toBeVisible();
  await expect(page.getByRole("button", { name: "שיבוץ מחדש" })).toBeVisible();
});
