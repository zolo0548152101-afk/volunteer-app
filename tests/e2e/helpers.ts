import { expect, type Page } from "@playwright/test";

/** כניסה עם משתמש הדמו; מחכה שהכניסה תושלם (עזר משותף לכל קבצי ה-e2e שאינם בודקים כשלי כניסה) */
export async function login(page: Page, email: string, password = "demo1234") {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
