import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { readSessionToken } from "@/lib/session-token";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { Role, SessionUser } from "@/lib/permissions";

/**
 * המשתמש המחובר, כפי שהוא *עכשיו* במסד הנתונים. ה-JWT מחזיק רק מזהה:
 * תפקידים וסטטוס נקראים מחדש בכל בקשה, כך שהשבתה והסרת תפקיד נכנסות לתוקף מיד.
 * מוחזר null אם אין session, המשתמש נמחק, או אינו פעיל.
 */
export const getActor = cache(async (): Promise<(SessionUser & { name: string }) | null> => {
  // קריאה בלבד של ה-JWT. auth() מחדש את העוגייה בכל תשובה, ובקשת RSC שחוזרת אחרי יציאה הייתה מחייה את ההתחברות
  const token = await readSessionToken(await headers());
  const s = token?.uid ? { user: { id: token.uid as string, organizationId: token.organizationId as string }, loginAt: Number(token.loginAt ?? 0) } : null;
  if (!s) return null;
  const [u] = await db()
    .select({ id: users.id, organizationId: users.organizationId, roles: users.roles, status: users.status, invalidBefore: users.sessionsInvalidBefore, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(and(eq(users.id, s.user.id), eq(users.organizationId, s.user.organizationId)))
    .limit(1);
  if (!u || u.status !== "active") return null;
  // יציאה / איפוס סיסמה מבטלים כל התחברות קודמת, גם אם עוגייה ישנה חזרה לדפדפן אחרי היציאה
  if (u.invalidBefore && s.loginAt < u.invalidBefore.getTime()) return null;
  return { id: u.id, organizationId: u.organizationId, roles: u.roles, name: `${u.firstName} ${u.lastName}`.trim() };
});

/** המשתמש המחובר, או הפניה לכניסה */
export async function requireActor(): Promise<SessionUser & { name: string }> {
  const a = await getActor();
  if (!a) redirect("/login");
  return a;
}

/** כמו requireActor, ודורש תפקיד מסוים (אחרת חזרה לעמוד הבית של המשתמש) */
export async function requireRole(...roles: Role[]) {
  const a = await requireActor();
  if (!roles.some((r) => a.roles.includes(r))) redirect("/");
  return a;
}
