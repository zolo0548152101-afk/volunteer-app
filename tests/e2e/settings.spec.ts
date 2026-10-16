import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";
import { login } from "./helpers";

try { process.loadEnvFile(".env.local"); } catch {}

async function reset() {
  if (!process.env.DATABASE_URL) return;
  const { db, closeDb } = await import("../../lib/db");
  await db().execute(sql`UPDATE settings SET capacity_tolerance_hours = 1 WHERE organization_id = (SELECT organization_id FROM users WHERE email = 'manager@demo.test')`);
  await db().execute(sql`UPDATE notification_rules SET first_after_days = 7 WHERE kind = 'report_escalation' AND organization_id = (SELECT organization_id FROM users WHERE email = 'manager@demo.test')`);
  await db().execute(sql`DELETE FROM audit_log WHERE entity = 'custom_field' AND entity_id IN (SELECT id FROM custom_fields WHERE label_he LIKE 'e2e-%')`);
  await db().execute(sql`DELETE FROM custom_fields WHERE label_he LIKE 'e2e-%'`);
  await closeDb();
}
test.beforeAll(reset);
test.afterAll(reset);

test("מנהל עורך הגדרות ושדה מותאם; רכז חסום; cron בלי סוד נדחה", async ({ page, request }, info) => {
  test.skip(info.project.name !== "desktop", "משנה הגדרות דמו משותפות, רץ פעם אחת");
  expect((await request.get("/api/cron/escalation")).status()).toBe(401);
  expect((await request.get("/api/cron/reminders", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);

  await login(page, "coord1@demo.test");
  await page.goto("/manager/settings");
  await expect(page).not.toHaveURL(/\/manager\/settings/);
  await page.getByRole("button", { name: "יציאה" }).click();
  await expect(page).toHaveURL(/\/login/);

  await login(page, "manager@demo.test");
  await page.goto("/manager/settings");
  const general = page.locator("#general form");
  await general.getByLabel("סף פער מיעד הסטודנט (שעות)").fill("1.5");
  await general.getByRole("button", { name: "שמירה" }).click();
  await expect(page).toHaveURL(/saved=general/);
  await expect(page.locator("#general").getByRole("status")).toHaveText("נשמר");
  await expect(page.locator("#general form").getByLabel("סף פער מיעד הסטודנט (שעות)")).toHaveValue("1.5");

  // כלל התראה: שינוי "אחרי כמה ימים" נשמר ומוצג מחדש
  const esc = page.locator("form", { hasText: "הסלמת דיווח שממתין" });
  await esc.getByLabel("אחרי כמה ימים לשלוח").fill("2");
  await esc.getByRole("button", { name: "שמירה" }).click();
  await expect(page).toHaveURL(/saved=rules/);
  await expect(page.locator("form", { hasText: "הסלמת דיווח שממתין" }).getByLabel("אחרי כמה ימים לשלוח")).toHaveValue("2");

  await page.goto("/manager/custom-fields");
  const sect = page.locator("section", { hasText: "סטודנטים" }).first();
  const add = sect.locator("form").last();
  await add.getByLabel("שם בעברית").fill("e2e-מידת נעל");
  await add.getByLabel("סוג").selectOption("number");
  await add.getByRole("button", { name: "הוספת שדה" }).click();
  await expect(page.getByText("נשמר")).toBeVisible();
  await expect(page.locator("input[name=labelHe][value='e2e-מידת נעל']")).toBeVisible();
});
