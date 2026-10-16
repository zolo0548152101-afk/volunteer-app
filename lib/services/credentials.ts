import { and, eq, sql } from "drizzle-orm";
import { verifyPassword } from "@/lib/password";
import type { Db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { consumeToken, type TokenKind } from "@/lib/services/tokens";

/**
 * קובע סיסמה מקישור הזמנה / איפוס. הטוקן נצרך ונקבעת הסיסמה בטרנזקציה אחת.
 * משתמש מושבת לא מוחזר לחיים בקישור ישן; הזמנה מפעילה משתמש "הוזמן".
 */
export async function setPasswordFromToken(db: Db, input: { kind: Extract<TokenKind, "invite" | "password_reset">; raw: string; passwordHash: string }): Promise<boolean> {
  return db.transaction(async (tx) => {
    const r = await consumeToken(tx, { kind: input.kind, raw: input.raw });
    if (!r.ok) return false;
    const [u] = await tx.select({ status: users.status }).from(users).where(eq(users.id, r.userId)).for("update");
    if (!u || u.status === "inactive") {
      tx.rollback(); // הטוקן לא נצרך
    }
    await tx.update(users).set({ passwordHash: input.passwordHash, status: "active", sessionsInvalidBefore: new Date() }).where(eq(users.id, r.userId));
    return true;
  });
}

/**
 * מי נכנס עם מייל + סיסמה. אותו מייל יכול להופיע בכמה ארגונים (האינדקס הייחודי לפי ארגון+מייל),
 * ולכן הסיסמה מכריעה. תמיד מתבצעת לפחות בדיקת סיסמה אחת, כדי לא לחשוף אילו מיילים רשומים.
 */
export async function resolveLogin(db: Db, email: string, password: string) {
  const candidates = await db
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = ${email.toLowerCase()}`, eq(users.status, "active")))
    .limit(5);
  if (candidates.length === 0) await verifyPassword(password, "scrypt$00$00");
  for (const c of candidates) {
    if (c.passwordHash && (await verifyPassword(password, c.passwordHash))) return c;
  }
  return null;
}
