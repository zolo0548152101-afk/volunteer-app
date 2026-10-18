import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("מתג תצוגה: כהה וניגודיות גבוהה נשמרים אחרי רענון", async ({ page, isMobile }) => {
  await login(page, "manager@demo.test");
  await page.goto("/reports");
  const group = page.getByRole("group", { name: "מצב תצוגה" }).filter({ visible: true });
  await group.getByRole("button", { name: "כהה" }).click();
  await page.getByRole("button", { name: "ניגודיות גבוהה" }).filter({ visible: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
  void isMobile;
});

test("כרטיס סטודנט: צפייה, ועריכה במקום עם שמירה וביטול", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "משנה נתוני דמו, רץ פעם אחת");
  await login(page, "manager@demo.test");
  await page.goto("/students");
  await page.getByRole("link", { name: "איתי גולן" }).click();
  const card = page.locator("#academic");
  await expect(card.getByText("עיר מגורים")).toBeVisible();
  await expect(card.getByRole("textbox")).toHaveCount(0); // במצב צפייה אין שדות
  await card.getByRole("button", { name: "עריכה" }).click();
  await expect(card.getByLabel("עיר מגורים")).toBeVisible();
  await card.getByRole("button", { name: "ביטול" }).click();
  await expect(card.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("link", { name: "תעודת שעות" }).click();
  await page.getByRole("link", { name: "חזרה" }).click();
  await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/);
  await page.getByRole("link", { name: "חזרה לרשימת הסטודנטים" }).click();
  await expect(page).toHaveURL(/\/students$/);
});
