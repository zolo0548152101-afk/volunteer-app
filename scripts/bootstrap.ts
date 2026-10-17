/**
 * הקמת הארגון הראשון בסביבה חדשה (ייצור). שימוש:
 *   ORG_NAME="..." MANAGER_EMAIL=... MANAGER_FIRST=... MANAGER_LAST=... APP_URL=https://... \
 *     pnpm exec tsx scripts/bootstrap.ts
 * עם DATABASE_URL של הסביבה הרצויה. מדפיס מזהה ארגון (ל-REGISTRATION_ORG_ID) וקישור הזמנה חד-פעמי למנהל.
 * מסרב לרוץ אם כבר יש ארגון במסד (כדי לא ליצור כפילות בטעות).
 */
import { closeDb, db } from "@/lib/db";
import { bootstrapOrganization } from "@/lib/db/bootstrap";
import { organizations } from "@/lib/db/schema";

async function main() {
  const need = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`חסר ${k}`);
    return v;
  };
  const existing = await db().select({ id: organizations.id }).from(organizations).limit(1);
  if (existing.length > 0 && process.env.ALLOW_SECOND_ORG !== "1") throw new Error("כבר יש ארגון במסד. להוספת ארגון נוסף: ALLOW_SECOND_ORG=1");
  const r = await bootstrapOrganization(db(), {
    orgName: need("ORG_NAME"),
    managerEmail: need("MANAGER_EMAIL"),
    managerFirstName: need("MANAGER_FIRST"),
    managerLastName: need("MANAGER_LAST"),
  });
  const base = process.env.APP_URL ?? "http://localhost:3000";
  console.log("REGISTRATION_ORG_ID =", r.organizationId);
  console.log("קישור הזמנה למנהל (תקף 7 ימים, חד-פעמי):", `${base}/invite?token=${r.inviteToken}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
