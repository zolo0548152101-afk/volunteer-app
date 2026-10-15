import "server-only";
import { db } from "@/lib/db";
import { notify } from "@/lib/services/notify";
import { issueToken } from "@/lib/services/tokens";
import { isLocale } from "@/i18n/config";

/** כתובת בסיס לקישורים במיילים */
function baseUrl() {
  return process.env.APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
}

/** רק נתיבים פנימיים; מונע הפניה לאתר זר דרך ?next= */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/** שולח קישור הזמנה / איפוס. לא פעולת שרת: נקרא רק מקוד שרת שכבר בדק הרשאה. */
export async function sendLink(u: { id: string; organizationId: string; email: string; locale: string }, kind: "invite" | "password_reset") {
  const raw = await issueToken(db(), { organizationId: u.organizationId, userId: u.id, kind });
  const path = kind === "invite" ? "invite" : "reset";
  await notify({
    channel: "email",
    to: u.email,
    template: kind === "invite" ? "auth.invite" : "auth.reset",
    data: { link: `${baseUrl()}/${path}?token=${raw}` },
    locale: isLocale(u.locale) ? u.locale : "he",
  });
}

