/**
 * הקמת ארגון אמיתי (בלי נתוני הדגמה): ארגון, הגדרות ברירת מחדל, כללי התראה, רשימות בחירה,
 * ומנהל ראשון במצב "מוזמן". הסיסמה נקבעת מקישור הזמנה חד-פעמי, לא נשמרת ולא מודפסת.
 * שנה אקדמית ומסלולים נוצרים אחר כך במסך ההגדרות (הם החלטות של המנהל, לא ברירת מחדל).
 */
import type { Db } from "@/lib/db";
import { lookups, notificationRules, organizations, settings, users } from "@/lib/db/schema";
import { absenceReasons, volunteerTypes } from "@/lib/db/seed";
import { DEFAULT_RULES, type RuleKind } from "@/lib/services/reminders";
import { issueToken } from "@/lib/services/tokens";

export type BootstrapInput = { orgName: string; managerEmail: string; managerFirstName: string; managerLastName: string };

export async function bootstrapOrganization(db: Db, input: BootstrapInput) {
  const email = input.managerEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("bad_email");
  if (!input.orgName.trim() || !input.managerFirstName.trim() || !input.managerLastName.trim()) throw new Error("missing_fields");

  return db.transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values({ name: input.orgName.trim() }).returning();
    const base = { organizationId: org.id };
    await tx.insert(settings).values(base);
    await tx.insert(notificationRules).values(
      (Object.entries(DEFAULT_RULES) as [RuleKind, (typeof DEFAULT_RULES)[RuleKind]][]).map(([kind, rule]) => ({ ...base, kind, ...rule })),
    );
    await tx.insert(lookups).values([
      ...volunteerTypes.map(([key, he, en], i) => ({ ...base, kind: "volunteer_type", key, labelHe: he, labelEn: en, sortOrder: i })),
      ...absenceReasons.map(([key, he, en], i) => ({ ...base, kind: "absence_reason", key, labelHe: he, labelEn: en, sortOrder: i })),
    ]);
    const [manager] = await tx
      .insert(users)
      .values({ ...base, email, firstName: input.managerFirstName.trim(), lastName: input.managerLastName.trim(), roles: ["manager"], status: "invited" })
      .returning();
    const inviteToken = await issueToken(tx, { organizationId: org.id, userId: manager.id, kind: "invite" });
    return { organizationId: org.id, managerId: manager.id, inviteToken };
  });
}
