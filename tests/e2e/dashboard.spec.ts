import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("מנהל: לוח הבקרה – ברכה, משפט מצב, 5 מדדים מקשרים, עומס רכזים, בלי גלילה אופקית, axe נקי", async ({ page }) => {
  await login(page, "manager@demo.test");
  await expect(page).toHaveURL(/\/manager$/);
  await expect(page.getByRole("heading", { level: 1, name: /מירב/ })).toBeVisible();
  await expect(page.getByText(/מחכים לאישור|מחכה לאישור|אין דיווחים שמחכים/)).toBeVisible();
  // המדדים הם קישורים עם הטקסט המלא
  await expect(page.getByRole("link", { name: /סטודנטים פעילים/ })).toHaveAttribute("href", "/students");
  await expect(page.getByRole("link", { name: /דיווחים ממתינים/ })).toHaveAttribute("href", "/reports?status=pending");
  // "ממתינים לראיון" פתוח גם למנהל
  await page.getByRole("link", { name: /ממתינים לראיון/ }).first().click();
  await expect(page).toHaveURL(/\/interviewer$/);
  await expect(page.getByRole("heading", { name: "ממתינים לראיון" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "עומס רכזים" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "דיווחים שמחכים הכי הרבה" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "תפוסה לפי מקום" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
});

test("רכז: אותו לוח בהיקף שלו, בלי עומס רכזים; הניווט מסמן את העמוד הנוכחי", async ({ page, isMobile }) => {
  await login(page, "coord1@demo.test");
  await expect(page).toHaveURL(/\/coordinator$/);
  await expect(page.getByRole("heading", { level: 1, name: /דנה/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "עומס רכזים" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "השנה במספרים" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: isMobile ? "ניווט תחתון" : "ניווט ראשי" });
  await expect(nav.getByRole("link", { name: /לוח בקרה/ })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: /תיבת אישורים/ }).click();
  await expect(page).toHaveURL(/\/reports/);
  await expect(nav.getByRole("link", { name: /תיבת אישורים/ })).toHaveAttribute("aria-current", "page");
});

test("מראיין וסטודנט לא רואים את לוח הבקרה", async ({ page }) => {
  await login(page, "student1@demo.test");
  await page.goto("/analytics");
  await expect(page).not.toHaveURL(/\/analytics/);
});

test("מנהל בטלפון מגיע להגדרות ולמשתמשים דרך 'עוד'", async ({ page, isMobile }) => {
  test.skip(!isMobile, "תפריט 'עוד' קיים רק בטלפון");
  await login(page, "manager@demo.test");
  const nav = page.getByRole("navigation", { name: "ניווט תחתון" });
  await nav.getByRole("button", { name: "עוד" }).click();
  await expect(nav.getByRole("link", { name: "משתמשים" })).toBeVisible();
  await nav.getByRole("link", { name: "הגדרות" }).click();
  await expect(page).toHaveURL(/\/manager\/settings/);
  await expect(nav.getByRole("link", { name: "משתמשים" })).toHaveCount(0); // נסגר אחרי מעבר עמוד
});
