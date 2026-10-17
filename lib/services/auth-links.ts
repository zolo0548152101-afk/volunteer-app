import "server-only";
import { db } from "@/lib/db";
import { notificationLog } from "@/lib/db/schema";
import { notify, type NotifyResult } from "@/lib/services/notify";
import { issueToken } from "@/lib/services/tokens";
import { isLocale } from "@/i18n/config";

/** כתובת בסיס לקישורים במיילים */
function baseUrl() {
  return process.env.APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
}

export { safeNext } from "@/lib/safe-next";

/** שולח קישור הזמנה / איפוס. לא פעולת שרת: נקרא רק מקוד שרת שכבר בדק הרשאה. */
export async function sendLink(u: { id: string; organizationId: string; email: string; locale: string }, kind: "invite" | "password_reset"): Promise<NotifyResult> {
  const raw = await issueToken(db(), { organizationId: u.organizationId, userId: u.id, kind });
  const path = kind === "invite" ? "invite" : "reset";
  const result = await notify({
    channel: "email",
    to: u.email,
    template: kind === "invite" ? "auth.invite" : "auth.reset",
    data: { link: `${baseUrl()}/${path}?token=${raw}` },
    locale: isLocale(u.locale) ? u.locale : "he",
  });
  // נרשם גם כישלון: אחרת הזמנה שלא הגיעה לא משאירה שום עקבות
  await db().insert(notificationLog).values({
    organizationId: u.organizationId, kind: kind === "invite" ? "auth.invite" : "auth.reset", entity: "user", entityId: u.id,
    recipientId: u.id, channel: result.channel, ok: result.ok, error: result.error?.slice(0, 200) ?? null,
  });
  return result;
}

