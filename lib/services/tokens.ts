/**
 * טוקנים חד-פעמיים (הזמנה, איפוס סיסמה, קוד SMS).
 * ב-DB נשמר רק hash. הערך עצמו נשלח למשתמש ולא נשמר בשום מקום.
 * שימוש חד-פעמי, תוקף מוגבל, ומספר ניסיונות מוגבל (לקוד קצר).
 */
import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { authTokens } from "@/lib/db/schema";
import type { DbOrTx } from "@/lib/db";

export type TokenKind = "invite" | "password_reset" | "otp";

export const TOKEN_POLICY: Record<TokenKind, { ttlMs: number; maxAttempts: number }> = {
  invite: { ttlMs: 7 * 24 * 3600_000, maxAttempts: 10 },
  password_reset: { ttlMs: 60 * 60_000, maxAttempts: 10 },
  otp: { ttlMs: 10 * 60_000, maxAttempts: 5 },
};

export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** קישור: 32 בתים אקראיים. קוד SMS: 6 ספרות */
export function generateRaw(kind: TokenKind): string {
  return kind === "otp" ? String(randomInt(0, 1_000_000)).padStart(6, "0") : randomBytes(32).toString("base64url");
}

/** יוצר טוקן חדש ומבטל קודמים פעילים מאותו סוג למשתמש. מחזיר את הערך הגולמי לשליחה. */
export async function issueToken(
  db: DbOrTx,
  input: { organizationId: string; userId: string; kind: TokenKind; now?: Date },
): Promise<string> {
  const now = input.now ?? new Date();
  const raw = generateRaw(input.kind);
  await db
    .update(authTokens)
    .set({ usedAt: now })
    .where(and(eq(authTokens.userId, input.userId), eq(authTokens.kind, input.kind), isNull(authTokens.usedAt)));
  await db.insert(authTokens).values({
    organizationId: input.organizationId,
    userId: input.userId,
    kind: input.kind,
    // קוד קצר חייב להיות קשור למשתמש, לכן ה-hash כולל את המזהה שלו
    tokenHash: hashToken(input.kind === "otp" ? `${input.userId}:${raw}` : raw),
    expiresAt: new Date(now.getTime() + TOKEN_POLICY[input.kind].ttlMs),
  });
  return raw;
}

export type ConsumeResult =
  | { ok: true; userId: string; organizationId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" | "too_many_attempts" };

/**
 * צורך טוקן. לקישורים (invite / password_reset) מספיק הערך. לקוד SMS חובה userId,
 * וכל ניסיון כושל נספר, כך שאי אפשר לנחש קוד.
 */
export async function consumeToken(
  db: DbOrTx,
  input: { kind: TokenKind; raw: string; userId?: string; now?: Date },
): Promise<ConsumeResult> {
  const now = input.now ?? new Date();
  const policy = TOKEN_POLICY[input.kind];

  if (input.kind === "otp") {
    if (!input.userId) return { ok: false, reason: "invalid" };
    // הטוקן הפעיל האחרון של המשתמש; הספירה על הטוקן, לא על הקוד שהוזן
    const [active] = await db
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.userId, input.userId), eq(authTokens.kind, "otp"), isNull(authTokens.usedAt)))
      .orderBy(sql`${authTokens.createdAt} desc`)
      .limit(1);
    if (!active) return { ok: false, reason: "invalid" };
    if (active.expiresAt <= now) return { ok: false, reason: "expired" };
    if (active.attempts >= policy.maxAttempts) return { ok: false, reason: "too_many_attempts" };
    if (active.tokenHash !== hashToken(`${input.userId}:${input.raw}`)) {
      await db.update(authTokens).set({ attempts: sql`${authTokens.attempts} + 1` }).where(eq(authTokens.id, active.id));
      return { ok: false, reason: "invalid" };
    }
    // סימון כמשומש בתנאי: שני בקשות במקביל לא ישתמשו באותו קוד
    const upd = await db
      .update(authTokens)
      .set({ usedAt: now })
      .where(and(eq(authTokens.id, active.id), isNull(authTokens.usedAt)))
      .returning({ id: authTokens.id });
    if (upd.length === 0) return { ok: false, reason: "used" };
    return { ok: true, userId: active.userId, organizationId: active.organizationId };
  }

  const [row] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hashToken(input.raw)), eq(authTokens.kind, input.kind)))
    .limit(1);
  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt <= now) return { ok: false, reason: "expired" };
  const upd = await db
    .update(authTokens)
    .set({ usedAt: now })
    .where(and(eq(authTokens.id, row.id), isNull(authTokens.usedAt)))
    .returning({ id: authTokens.id });
  if (upd.length === 0) return { ok: false, reason: "used" };
  return { ok: true, userId: row.userId, organizationId: row.organizationId };
}
