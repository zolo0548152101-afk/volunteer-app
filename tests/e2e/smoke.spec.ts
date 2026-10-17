import { expect, test } from "@playwright/test";

test("דף הכניסה עולה בעברית ו-RTL", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "כניסה למערכת" })).toBeVisible();
  await expect(page.getByLabel("אימייל")).toBeVisible();
});

test("החלפת שפה לאנגלית הופכת ל-LTR ומשאירה את הבחירה", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("אין גלילה אופקית במסך הכניסה", async ({ page }) => {
  await page.goto("/login");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("כותרות אבטחה: אין הטמעה ב-iframe, Referrer מוגבל", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["x-content-type-options"]).toBe("nosniff");
});

test("כניסת פיתוח כבויה כברירת מחדל: /dev-login מחזיר 404", async ({ page }) => {
  const res = await page.goto("/dev-login");
  expect(res?.status()).toBe(404);
});
