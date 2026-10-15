import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { Role, SessionUser } from "@/lib/permissions";

/**
 * המשתמש המחובר, כפי שהוא *עכשיו* במסד הנתונים. ה-JWT מחזיק רק מזהה:
 * תפקידים וסטטוס נקראים מחדש בכל בקשה, כך שהשבתה והסרת תפקיד נכנסות לתוקף מיד.
 * מוחזר null אם אין session, המשתמש נמחק, או אינו פעיל.
 */
export const getActor = cache(async (): Promise<(SessionUser & { name: string }) | null> => {
  const s = await auth();
  if (!s?.user?.id) return null;
  const [u] = await db()
    .select({ id: users.id, organizationId: users.organizationId, roles: users.roles, status: users.status, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(and(eq(users.id, s.user.id), eq(users.organizationId, s.user.organizationId)))
    .limit(1);
  if (!u || u.status !== "active") return null;
  return { id: u.id, organizationId: u.organizationId, roles: u.roles, name: `${u.firstName} ${u.lastName}`.trim() };
});

/** המשתמש המחובר, או הפניה לכניסה */
export async function requireActor(): Promise<SessionUser & { name: string }> {
  const a = await getActor();
  if (!a) redirect("/login");
  return a;
}

/** כמו requireActor, ודורש תפקיד מסוים (אחרת חזרה לעמוד הבית של המשתמש) */
export async function requireRole(role: Role) {
  const a = await requireActor();
  if (!a.roles.includes(role)) redirect("/");
  return a;
}
