import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";

try { process.loadEnvFile(".env.local"); } catch {}

// דורש את ארגון הדמו על ענף הפיתוח (pnpm db:seed)
const PASSWORD = "demo1234";

async function login(page: import("@playwright/test").Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "כניסה" }).click();
}

test("סיסמה שגויה: הודעה עניינית ונשארים בכניסה", async ({ page }) => {
  await login(page, "manager@demo.test", "wrong-password");
  await expect(page.locator("p[role=alert]")).toHaveText("האימייל או הסיסמה לא נכונים");
  await expect(page).toHaveURL(/\/login/);
});

for (const [email, path, heading] of [
  ["manager@demo.test", "/manager", "מנהל"],
  ["coord1@demo.test", "/coordinator", "רכז"],
  ["interviewer@demo.test", "/interviewer", "ממתינים לראיון"],
  ["student1@demo.test", "/student", "שירה אביב"],
] as const) {
  test(`${email} נכנס לעמוד הבית של התפקיד שלו ואפשר לצאת`, async ({ page }) => {
    await login(page, email);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await page.getByRole("button", { name: "יציאה" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  });
}

test("דף מוגן בלי התחברות מפנה לכניסה", async ({ page }) => {
  await page.goto("/manager");
  await expect(page).toHaveURL(/\/login\?next=%2Fmanager/);
});

test("שכחתי סיסמה: אותה תשובה לכתובת קיימת ולא קיימת", async ({ page }) => {
  for (const email of ["manager@demo.test", "nobody@nowhere.test"]) {
    await page.goto("/forgot");
    await page.getByLabel("אימייל").fill(email);
    await page.getByRole("button", { name: "שלחו לי קישור" }).click();
    await expect(page.getByRole("status")).toContainText("אם הכתובת קיימת");
  }
});

test("קישור איפוס לא תקף", async ({ page }) => {
  await page.goto("/reset?token=bogus");
  await page.getByLabel("סיסמה חדשה (לפחות 8 תווים)").fill("longenough1");
  await page.getByLabel("אימות סיסמה").fill("longenough1");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("הקישור לא תקף");
});

test.describe("ניהול משתמשים", () => {
  test("מנהל רואה את המסך ומזמין משתמש; רכז נדחה", async ({ page }) => {
    await login(page, "coord1@demo.test");
    await expect(page).toHaveURL(/\/coordinator$/);
    await page.goto("/manager/users");
    await expect(page).toHaveURL(/\/coordinator$/);
    await page.getByRole("button", { name: "יציאה" }).click();
    await expect(page).toHaveURL(/\/login/);

    await login(page, "manager@demo.test");
    await expect(page).toHaveURL(/\/manager$/);
    await page.goto("/manager/users");
    await expect(page.getByRole("heading", { name: "משתמשים", level: 1 })).toBeVisible();
    const email = `e2e-${Date.now()}@demo.test`;
    await page.getByLabel("שם פרטי").fill("בדיקה");
    await page.getByLabel("שם משפחה").fill("אוטומטית");
    await page.getByLabel("אימייל").fill(email);
    await page.getByRole("button", { name: "שליחת הזמנה", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("ההזמנה נשלחה");
    await expect(page.getByText(email)).toBeVisible();
    // אותה כתובת פעם שנייה
    await page.getByLabel("שם פרטי").fill("שוב");
    await page.getByLabel("שם משפחה").fill("שוב");
    await page.getByLabel("אימייל").fill(email);
    await page.getByRole("button", { name: "שליחת הזמנה", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toContainText("כבר רשום");
  });
});

test.afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const { db, closeDb } = await import("../../lib/db");
  await db().execute(sql`DELETE FROM users WHERE email LIKE 'e2e-%@demo.test'`);
  await closeDb();
});

test.describe("שימור חשבונות בזמן אמת", () => {
  test("השבתה נכנסת לתוקף מיד, בלי כניסה מחדש", async ({ page }) => {
    test.skip(!process.env.DATABASE_URL, "דורש DB");
    const { db, closeDb } = await import("../../lib/db");
    const email = "student6@demo.test";
    await login(page, email);
    await expect(page).toHaveURL(/\/student$/);
    await db().execute(sql`UPDATE users SET status = 'inactive' WHERE email = ${email}`);
    try {
      await page.goto("/student");
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await db().execute(sql`UPDATE users SET status = 'active' WHERE email = ${email}`);
      await closeDb();
    }
  });

  test("סטודנט לא נכנס לדפי מנהל גם כשהוא מחובר", async ({ page }) => {
    await login(page, "student5@demo.test");
    await expect(page).toHaveURL(/\/student$/);
    await page.goto("/manager/users");
    await expect(page).toHaveURL(/\/student$/);
  });
});

test("אחרי יציאה, עוגייה ישנה שחוזרת לדפדפן כבר לא מחברת", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop");
  await login(page, "coord2@demo.test");
  await expect(page).toHaveURL(/\/coordinator$/);
  const old = (await context.cookies()).find((c) => c.name.endsWith("session-token"))!;
  await page.getByRole("button", { name: "יציאה" }).click();
  await expect(page).toHaveURL(/\/login/);
  await context.addCookies([old]); // כמו תשובה מאוחרת שמחזירה את העוגייה
  await page.goto("/coordinator");
  await expect(page).toHaveURL(/\/login/);
});
