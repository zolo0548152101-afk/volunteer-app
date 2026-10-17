import { createHash } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { authAttempts } from "@/lib/db/schema";

/** מפתח הגבלה: סוג + ערך מגובב, כדי שמיילים לא יישמרו גלויים בטבלה */
export const limitKey = (kind: string, value: string) => `${kind}:${createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 32)}`;

/** האם כבר היו {max} ניסיונות או יותר בחלון האחרון */
export async function isLimited(db: Db, key: string, max: number, windowSec: number, now = new Date()): Promise<boolean> {
  if (process.env.DISABLE_RATE_LIMIT === "1" && process.env.VERCEL_ENV !== "production") return false; // רק לסביבת בדיקות e2e: כל הכניסות מאותה כתובת
  const since = new Date(now.getTime() - windowSec * 1000);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(authAttempts).where(and(eq(authAttempts.key, key), gt(authAttempts.createdAt, since)));
  return n >= max;
}

export async function recordAttempt(db: Db, key: string, now = new Date()): Promise<void> {
  await db.insert(authAttempts).values({ key, createdAt: now });
  // ניקוי: שורות מעל יממה לא משרתות אף חלון
  await db.delete(authAttempts).where(lt(authAttempts.createdAt, new Date(now.getTime() - 24 * 3600 * 1000)));
}

export async function clearAttempts(db: Db, key: string): Promise<void> {
  await db.delete(authAttempts).where(eq(authAttempts.key, key));
}

/** כתובת הלקוח כפי שהפרוקסי מדווח (Vercel מציב x-forwarded-for) */
export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
