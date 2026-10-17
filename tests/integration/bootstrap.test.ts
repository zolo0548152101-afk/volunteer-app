import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import { academicYears, lookups, notificationRules, users } from "@/lib/db/schema";
import { deleteOrganization } from "@/lib/db/seed";
import { bootstrapOrganization } from "@/lib/db/bootstrap";
import { consumeToken } from "@/lib/services/tokens";

const created: string[] = [];
afterAll(async () => {
  for (const id of created) await deleteOrganization(db(), id);
  await closeDb();
});

describe("הקמת ארגון אמיתי", () => {
  it("יוצר ארגון עם ברירות מחדל ומנהל מוזמן בלבד, בלי נתוני הדגמה ובלי סיסמה", async () => {
    const r = await bootstrapOrganization(db(), { orgName: `בדיקת הקמה ${Date.now()}`, managerEmail: "boot-test@example.com", managerFirstName: "נועה", managerLastName: "בדיקה" });
    created.push(r.organizationId);
    const us = await db().select().from(users).where(eq(users.organizationId, r.organizationId));
    expect(us).toHaveLength(1);
    expect(us[0]).toMatchObject({ roles: ["manager"], status: "invited", passwordHash: null });
    expect((await db().select().from(notificationRules).where(eq(notificationRules.organizationId, r.organizationId))).length).toBe(3);
    expect((await db().select().from(lookups).where(eq(lookups.organizationId, r.organizationId))).length).toBeGreaterThan(0);
    expect(await db().select().from(academicYears).where(eq(academicYears.organizationId, r.organizationId))).toHaveLength(0);
    // הקישור עובד פעם אחת
    expect(r.inviteToken.length).toBeGreaterThan(20);
    const c = await consumeToken(db(), { kind: "invite", raw: r.inviteToken });
    expect(c).toMatchObject({ ok: true, userId: r.managerId });
  });

  it("מסרב למייל לא תקין ולשדות ריקים בלי ליצור כלום", async () => {
    await expect(bootstrapOrganization(db(), { orgName: "x", managerEmail: "not-an-email", managerFirstName: "א", managerLastName: "ב" })).rejects.toThrow("bad_email");
    await expect(bootstrapOrganization(db(), { orgName: " ", managerEmail: "a@b.co", managerFirstName: "א", managerLastName: "ב" })).rejects.toThrow("missing_fields");
  });
});
