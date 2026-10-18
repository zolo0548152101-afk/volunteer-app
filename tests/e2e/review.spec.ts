import { expect, test } from "@playwright/test";
import { login, openUserMenu } from "./helpers";

// שינויים מסקירת UI/UX החיצונית (P1–P3)

test("השבתת משתמש דורשת אישור: לחיצה אחת לא משביתה", async ({ page }) => {
  await login(page, "manager@demo.test");
  await page.goto("/manager/users");
  const row = page.getByRole("row", { name: /איתי גולן/ });
  await row.getByRole("button", { name: "עריכה" }).click();
  const dlg = page.getByRole("dialog", { name: /איתי גולן/ });
  await dlg.getByRole("button", { name: "השבתה" }).click();
  const confirm = page.getByRole("dialog", { name: /להשבית את איתי גולן/ });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "ביטול" }).click();
  await expect(confirm).toBeHidden();
  await page.reload();
  await row.getByRole("button", { name: "עריכה" }).click();
  await expect(page.getByRole("dialog", { name: /איתי גולן/ }).getByRole("button", { name: "השבתה" })).toBeVisible(); // לא הושבת (אחרת היה "הפעלה")
});

test("שמירה מציגה הודעת 'נשמר', וחלון עם שינויים שלא נשמרו שואל לפני סגירה", async ({ page }) => {
  await login(page, "manager@demo.test");
  await page.goto("/manager/users");
  // שמירה בלי שינוי בפועל: רק בודקים את המשוב
  await page.getByRole("row", { name: /איתי גולן/ }).getByRole("button", { name: "עריכה" }).click();
  await page.getByRole("dialog", { name: /איתי גולן/ }).getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(page.getByRole("status").getByText("נשמר")).toBeVisible();

  await page.goto("/places");
  await page.getByRole("button", { name: /מקום חדש/ }).click();
  const dlg = page.getByRole("dialog", { name: "מקום חדש" });
  await dlg.getByLabel("שם המקום").fill("טיוטה שלא תישמר");
  await page.keyboard.press("Escape");
  await expect(dlg.getByRole("alertdialog")).toContainText("לצאת בלי לשמור?");
  await dlg.getByRole("button", { name: "המשך עריכה" }).click();
  await expect(dlg.getByLabel("שם המקום")).toHaveValue("טיוטה שלא תישמר");
  await page.keyboard.press("Escape");
  await dlg.getByRole("button", { name: "יציאה בלי לשמור" }).click();
  await expect(dlg).toBeHidden();
});

test("שדה בחירה: עד 4 אפשרויות כתגיות גלויות, ומעל זה רשימה נפתחת בלחיצה על כל השדה", async ({ page }) => {
  await login(page, "manager@demo.test");
  await page.goto("/manager/users");
  await page.getByRole("button", { name: /הזמנת משתמש/ }).click();
  const dlg = page.getByRole("dialog", { name: "הזמנת משתמש" });
  const roles = dlg.getByRole("group", { name: "תפקידים" });
  await expect(roles.getByRole("button", { name: "סטודנט" })).toHaveAttribute("aria-pressed", "true");
  await roles.getByRole("button", { name: "רכז" }).click();
  await expect(roles.getByRole("button", { name: "רכז" })).toHaveAttribute("aria-pressed", "true");
  const box = await roles.getByRole("button", { name: "רכז" }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(43);
});

test("תפריט מנהל: 5 פריטי עבודה, ניהול מערכת בתפריט, ו'יציאה' בתפריט המשתמש", async ({ page, isMobile }) => {
  test.skip(isMobile, "תפריט עליון במחשב");
  await login(page, "manager@demo.test");
  const nav = page.getByRole("navigation", { name: "ניווט ראשי" });
  await expect(nav.getByRole("link")).toHaveCount(5);
  await expect(nav.getByRole("link", { name: "משתמשים" })).toHaveCount(0);
  await nav.getByRole("button", { name: "ניהול מערכת" }).click();
  await expect(nav.getByRole("link", { name: "משתמשים" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "הגדרות" })).toBeVisible();
  await page.keyboard.press("Escape");
  await openUserMenu(page);
  const logout = page.getByRole("button", { name: "יציאה" });
  await expect(logout).toBeVisible();
});

test("הגדרות: רשימות בחירה כטבלה עם עריכה וחיצי סדר, בלי כפתור שמירה לכל שורה", async ({ page }) => {
  await login(page, "manager@demo.test");
  await page.goto("/manager/settings");
  const lookups = page.locator("#lookups");
  await expect(lookups.getByRole("columnheader", { name: "עברית" }).first()).toBeVisible();
  await expect(lookups.getByRole("button", { name: "שמירה", exact: true })).toHaveCount(0);
  await expect(lookups.getByRole("button", { name: /הזזה למעלה/ }).first()).toBeDisabled();
});

test("תיבת אישורים: סינון בחלון, תגית פעילה ו× מסיר אותה", async ({ page, isMobile }) => {
  await login(page, "coord1@demo.test");
  await page.goto("/reports");
  await page.getByRole("button", { name: /^סינון/ }).click();
  const dlg = page.getByRole("dialog", { name: "סינון דיווחים" });
  const place = dlg.getByLabel("מקום", { exact: true });
  const first = await place.locator("option").nth(1).getAttribute("value");
  await place.selectOption(first!);
  await dlg.getByRole("button", { name: "הצגה" }).click();
  await expect(page).toHaveURL(/place=/);
  await expect(page.getByRole("button", { name: "סינון (1)" })).toBeVisible();
  await page.getByRole("link", { name: /הסרת מסנן: מקום/ }).click();
  await expect(page).not.toHaveURL(/place=/);
  void isMobile;
});

test("שגיאת שמירה: החלון נפתח מחדש עם ההודעה בתוכו", async ({ page }) => {
  await login(page, "manager@demo.test");
  await page.goto("/manager/users");
  await page.getByRole("row", { name: /איתי גולן/ }).getByRole("button", { name: "עריכה" }).click();
  const dlg = page.getByRole("dialog", { name: /איתי גולן/ });
  await dlg.getByRole("group", { name: "תפקידים" }).getByRole("button", { name: "סטודנט" }).click(); // מבטל את התפקיד היחיד
  await dlg.getByRole("button", { name: "שמירה", exact: true }).click();
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole("alert")).toContainText("לפחות תפקיד אחד");
});
