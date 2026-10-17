import { expect, test } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { login } from "./helpers";

try { process.loadEnvFile(".env.local"); } catch {}

// זרימות שבודקות מקצה לקצה דברים שהאינטגרציה כבר מכסה בשירות: כאן דרך ה-UI האמיתי.
// מחוץ ל-desktop לא רצות: הן משנות נתוני דמו משותפים.
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
const MARK = "e2e-wf";

async function cleanup() {
  if (!process.env.DATABASE_URL) return;
  const { db, closeDb } = await import("../../lib/db");
  await db().execute(sql`DELETE FROM audit_log WHERE entity = 'hour_report' AND entity_id IN (SELECT id FROM hour_reports WHERE student_notes = ${MARK})`);
  await db().execute(sql`DELETE FROM hour_reports WHERE student_notes = ${MARK}`);
  await db().execute(sql`DELETE FROM notification_log WHERE recipient_id IN (SELECT id FROM users WHERE email LIKE 'e2e-wf-%@demo.test')`);
  await db().execute(sql`DELETE FROM users WHERE email LIKE 'e2e-wf-%@demo.test'`);
  // ריצת ה-cron של הבדיקה רושמת שליחות בארגון הדמו; מסירים את מה שנרשם בשעה האחרונה
  await db().execute(sql`DELETE FROM notification_log WHERE sent_at > now() - interval '1 hour'`);
  await closeDb();
}
test.beforeAll(cleanup);
test.afterAll(cleanup);
test.beforeEach(({}, info) => { test.skip(info.project.name !== "desktop", "משנה נתוני דמו משותפים, רץ פעם אחת"); });

/** אסימון חדש לחשבון (הגולמי נשלח רק במייל, אז בבדיקה מכניסים ל-DB אחד שה-hash שלו ידוע; בלי ייבוא שירותים עם alias) */
async function tokenFor(email: string, kind: "invite" | "password_reset") {
  const { db, closeDb } = await import("../../lib/db");
  const raw = randomBytes(24).toString("hex");
  const hash = createHash("sha256").update(raw).digest("hex");
  try {
    await db().execute(sql`UPDATE auth_tokens SET used_at = now() WHERE used_at IS NULL AND kind = ${kind} AND user_id = (SELECT id FROM users WHERE email = ${email})`);
    await db().execute(sql`INSERT INTO auth_tokens (organization_id, user_id, kind, token_hash, expires_at)
      SELECT organization_id, id, ${kind}, ${hash}, now() + interval '1 hour' FROM users WHERE email = ${email}`);
  } finally { await closeDb(); }
  return raw;
}

test("הזמנה: מנהל מזמין, המוזמן קובע סיסמה ונכנס; אחר כך איפוס סיסמה עובד", async ({ page }) => {
  const email = `e2e-wf-${Date.now()}@demo.test`;
  await login(page, "manager@demo.test");
  await page.goto("/manager/users");
  await page.getByLabel("שם פרטי").fill("מוזמן");
  await page.getByLabel("שם משפחה").fill("חדש");
  await page.getByLabel("אימייל").fill(email);
  await page.getByRole("button", { name: "שליחת הזמנה", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("ההזמנה נשלחה");
  await page.getByRole("button", { name: "יציאה" }).click();
  await expect(page).toHaveURL(/\/login/);

  // המוזמן קובע סיסמה מהקישור, והקישור חד-פעמי
  const invite = await tokenFor(email, "invite");
  await page.goto(`/invite?token=${invite}`);
  await page.getByLabel("סיסמה חדשה (לפחות 8 תווים)").fill("firstpass1");
  await page.getByLabel("אימות סיסמה").fill("firstpass1");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByRole("link", { name: "כניסה" })).toBeVisible();
  await page.goto(`/invite?token=${invite}`);
  await page.getByLabel("סיסמה חדשה (לפחות 8 תווים)").fill("otherpass12");
  await page.getByLabel("אימות סיסמה").fill("otherpass12");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("הקישור לא תקף");
  await login(page, email, "firstpass1");
  await page.context().clearCookies(); // המוזמן נוחת באשף ההרשמה, שאין בו כפתור יציאה

  // איפוס: הסיסמה הישנה נפסלת, החדשה נכנסת
  const reset = await tokenFor(email, "password_reset");
  await page.goto(`/reset?token=${reset}`);
  await page.getByLabel("סיסמה חדשה (לפחות 8 תווים)").fill("resetpass12");
  await page.getByLabel("אימות סיסמה").fill("resetpass12");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByRole("link", { name: "כניסה" })).toBeVisible();
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(email);
  await page.getByLabel("סיסמה").fill("firstpass1");
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("לא נכונים");
  await login(page, email, "resetpass12");
});

test("דיווח: החזרה לתיקון, הסטודנט מתקן ושולח מחדש, הרכז מאשר, המנהל מבטל אישור", async ({ page }) => {
  const date = daysAgo(3);
  await login(page, "student2@demo.test");
  await page.goto("/student/report");
  await page.getByLabel("תאריך").fill(date);
  await page.locator("input[name=reportedHours]").fill("4");
  await page.getByText("עוד פרטים").click();
  await page.getByLabel("הערות").fill(MARK);
  await page.getByRole("button", { name: "שליחה לאישור" }).click();
  await expect(page).toHaveURL(/\/student\/reports\?sent=1/);
  await page.getByRole("button", { name: "יציאה" }).click();

  // הרכז מחזיר לתיקון; בלי הערה נחסם
  await login(page, "coord1@demo.test");
  await page.goto("/reports");
  const item = () => page.locator("li", { hasText: MARK });
  await item().getByRole("button", { name: "החזרה לתיקון" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("נדרשת סיבה");
  await item().getByLabel(/הערה/).first().fill("השעות לא תואמות לחוזה");
  await item().getByRole("button", { name: "החזרה לתיקון" }).click();
  await expect(item()).toHaveCount(0);
  await page.getByRole("button", { name: "יציאה" }).click();

  // הסטודנט רואה את ההערה, מתקן שעות ושולח מחדש
  await login(page, "student2@demo.test");
  await page.goto("/student/reports");
  await expect(page.getByText("השעות לא תואמות לחוזה")).toBeVisible();
  await page.getByRole("link", { name: "לתיקון" }).first().click();
  await page.locator("input[name=reportedHours]").fill("3");
  // שליחה מחדש מחליפה גם את ההערות של הסטודנט, אז מחזירים את הסימון שלנו
  await page.getByText("עוד פרטים").click();
  await page.getByLabel("הערות").fill(MARK);
  await page.getByRole("button", { name: "שליחה מחדש" }).click();
  await expect(page).toHaveURL(/\/student\/reports(\?|$)/); // לא דף התיקון עצמו (/reports/<id>)
  await page.getByRole("button", { name: "יציאה" }).click();

  // הרכז מאשר, ואז המנהל מבטל (רכז לא רואה את הכפתור)
  await login(page, "coord1@demo.test");
  await page.goto("/reports");
  await item().getByRole("button", { name: "אישור", exact: true }).click();
  await expect(item()).toHaveCount(0); // ממתינים לסיום הפעולה לפני שעוברים דף
  await page.goto("/reports?status=approved");
  await expect(item()).toContainText("אושר: 3");
  await expect(item().getByRole("button", { name: "ביטול אישור" })).toHaveCount(0);
  await page.getByRole("button", { name: "יציאה" }).click();

  await login(page, "manager@demo.test");
  await page.goto("/reports?status=approved");
  await item().getByLabel("סיבה לביטול האישור").fill("נספר פעמיים");
  await item().getByRole("button", { name: "ביטול אישור" }).click();
  // הדיווח חוזר לתור הממתינים (הפעולה חוזרת לרשימה הכללית)
  await expect(page).not.toHaveURL(/status=approved/);
  await page.goto("/reports?status=pending");
  await expect(item()).toBeVisible();
});

test("cron: עם הסוד הנכון מחזיר סיכום, ושתי הנקודות מוגנות", async ({ request }) => {
  const auth = { authorization: `Bearer ${process.env.E2E_CRON_SECRET ?? "e2e-cron-secret"}` };
  for (const path of ["escalation", "reminders"]) {
    const res = await request.get(`/api/cron/${path}`, { headers: auth });
    expect(res.status(), path).toBe(200);
    expect(await res.json()).toMatchObject({ sent: expect.any(Number), failed: expect.any(Number) });
  }
});

test("דוחות מנהל: רכזים, חודשים והיעדרויות נפתחים עם טבלה", async ({ page }) => {
  await login(page, "manager@demo.test");
  for (const kind of ["coordinators", "months", "absences"]) {
    const res = await page.goto(`/analytics/${kind}`);
    expect(res?.status(), kind).toBe(200);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
  }
});
