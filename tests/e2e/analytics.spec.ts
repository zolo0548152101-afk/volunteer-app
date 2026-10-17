import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("מנהל: לוח בקרה, דוח וייצוא Excel", async ({ page }) => {
  await login(page, "manager@demo.test");
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1, name: /מירב/ })).toBeVisible(); // לוח הבקרה פותח בברכה
  await expect(page.getByRole("link", { name: /סטודנטים פעילים/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "תפוסה לפי מקום" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "לפי סטודנט" }).click();
  await expect(page.getByRole("columnheader", { name: "התקדמות" })).toBeVisible();
  await expect(page.getByRole("row", { name: /שירה אביב/ })).toBeVisible();
  const res = await page.request.get("/api/export/students");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("spreadsheetml");
  expect((await res.body()).subarray(0, 2).toString()).toBe("PK");
});

test("רכז: רק הסטודנטים שלו בדוח; דוח רכזים חסום; ייצוא מוגבל", async ({ page }) => {
  await login(page, "coord1@demo.test");
  await page.goto("/analytics/students");
  await expect(page.getByRole("row", { name: /שירה אביב/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /מאיה דגן/ })).toHaveCount(0); // של רכז 2
  await page.goto("/analytics/coordinators");
  await expect(page).not.toHaveURL(/analytics\/coordinators/);
  expect((await page.request.get("/api/export/coordinators")).status()).toBe(403);
});

test("מראיין חסום מהדוחות; ייצוא בלי התחברות נדחה", async ({ page, request }) => {
  expect((await request.get("/api/export/students")).status()).toBe(401);
  await login(page, "interviewer@demo.test");
  await page.goto("/analytics");
  await expect(page).not.toHaveURL(/\/analytics/);
  expect((await page.request.get("/api/export/students")).status()).toBe(403);
});

test("תעודת שעות: סטודנט רואה את שלו, לא של אחר", async ({ page }) => {
  await login(page, "student1@demo.test");
  await page.getByRole("link", { name: "תעודת שעות" }).click();
  await expect(page.getByRole("heading", { name: "תעודת שעות התנדבות" })).toBeVisible();
  await expect(page.getByRole("main").getByText("שירה אביב")).toBeVisible();
  await expect(page.getByRole("button", { name: /הדפסה/ })).toBeVisible();
  const other = await page.request.get("/certificate/00000000-0000-0000-0000-000000000000");
  expect(other.status()).toBe(404);
});

test("מנהל: אין גלילה אופקית בהגדרות ובלוח הבקרה, והתוויות בגרף לא נכנסות לעמודות", async ({ page }) => {
  await login(page, "manager@demo.test");
  for (const path of ["/manager/settings", "/analytics"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, path).toBe(false);
  }
  // הגרף מצויר LTR, כדי ש-text-anchor לא יתהפך בעברית
  await page.goto("/analytics");
  const dir = await page.locator("[aria-labelledby=h-month] [dir=ltr]").first().evaluate((el) => getComputedStyle(el).direction);
  expect(dir).toBe("ltr");
});

test("דף לא קיים מציג 404 בעברית, לא את דף Next באנגלית", async ({ page }) => {
  await login(page, "manager@demo.test");
  await page.goto("/students/00000000-0000-0000-0000-000000000000");
  await expect(page.getByRole("heading", { name: "הדף הזה לא נמצא" })).toBeVisible();
});
