"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { TransactionRollbackError, and, eq, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { readSessionToken } from "@/lib/session-token";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { devLoginEnabled } from "@/lib/dev-login";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/password";
import { safeNext, sendLink } from "@/lib/services/auth-links";
import { isApplicantAwaitingInterview, setPasswordFromToken } from "@/lib/services/credentials";
import { clientIp, isLimited, limitKey, recordAttempt } from "@/lib/services/rate-limit";
import type { TokenKind } from "@/lib/services/tokens";

export type FormState = { error?: "invalid" | "weak" | "token" | "generic" | "rate_limited"; done?: boolean };

/** חלונות הגבלת הקצב לבקשות איפוס (מגבלת הכניסה נמצאת ב-authorize, lib/auth.ts) */
const RESET_EMAIL = { max: 5, windowSec: 3600 };
const RESET_IP = { max: 20, windowSec: 3600 };

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128; // scrypt על קלט ענק = DoS זול

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  try {
    await signIn("credentials", { email, password, redirectTo: safeNext(String(formData.get("next") ?? "")) });
  } catch (e) {
    if (e instanceof AuthError) {
      if (e instanceof CredentialsSignin && e.code === "rate_limited") return { error: "rate_limited" };
      if (e.type !== "CredentialsSignin") return { error: "generic" };
      return { error: "invalid" };
    }
    throw e; // ה-redirect של Next זורק, וזה כניסה מוצלחת
  }
  return {};
}

/** כניסת פיתוח: משתמש הדגמה לפי מזהה. מושבתת בייצור ובלי ENABLE_DEV_LOGIN (ראו lib/dev-login.ts) */
export async function devLoginAction(formData: FormData) {
  if (!devLoginEnabled()) notFound();
  await signIn("dev", { userId: String(formData.get("userId") ?? ""), redirectTo: "/" });
}

export async function logoutAction() {
  // ביטול בצד השרת: בקשה שהייתה בדרך בזמן היציאה עלולה להחזיר את העוגייה; ה-JWT שלה כבר לא יתקבל
  const token = await readSessionToken(await headers());
  if (token?.uid) await db().update(users).set({ sessionsInvalidBefore: new Date() }).where(eq(users.id, token.uid as string));
  await signOut({ redirectTo: "/login" });
}

/** תמיד אותה תשובה, בין אם המייל קיים ובין אם לא */
export async function requestResetAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.string().email().safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { error: "invalid" };
  // מעל המכסה: אותה תשובה כרגיל, בלי לשלוח. כך אי אפשר להפציץ תיבת מייל, וגם לא לגלות אילו מיילים רשומים
  const emailKey = limitKey("reset:email", parsed.data), ipKey = limitKey("reset:ip", clientIp(await headers()));
  const limited = (await isLimited(db(), emailKey, RESET_EMAIL.max, RESET_EMAIL.windowSec)) || (await isLimited(db(), ipKey, RESET_IP.max, RESET_IP.windowSec));
  await Promise.all([recordAttempt(db(), emailKey), recordAttempt(db(), ipKey)]);
  if (limited) return { done: true };
  // אותו מייל בכמה ארגונים: כל חשבון מקבל קישור משלו (הקישור מחייב את החשבון, לא את המייל)
  const matches = await db()
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = ${parsed.data.toLowerCase()}`, inArray(users.status, ["active", "invited"])))
    .limit(5);
  for (const u of matches) {
    // פונה שעוד לא עבר ראיון לא מקבל קישור כניסה בעצמו: הכניסה נפתחת רק אחרי הראיון
    if (await isApplicantAwaitingInterview(db(), u)) continue;
    await sendLink(u, "password_reset");
  }
  return { done: true };
}

/** הגדרת סיסמה מקישור הזמנה או איפוס. הטוקן נצרך רק אם הסיסמה תקינה. */
export async function setPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const kind = String(formData.get("kind")) as TokenKind;
  if (kind !== "invite" && kind !== "password_reset") return { error: "generic" };
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD || password !== String(formData.get("confirm") ?? "")) return { error: "weak" };
  const passwordHash = await hashPassword(password);
  let ok = false;
  try {
    ok = await setPasswordFromToken(db(), { kind, raw: String(formData.get("token") ?? ""), passwordHash });
  } catch (e) {
    if (!(e instanceof TransactionRollbackError)) throw e; // כשל אמיתי (למשל המסד) לא מוצג כ"קישור לא תקף"
    ok = false; // rollback של משתמש מושבת
  }
  if (!ok) return { error: "token" };
  return { done: true };
}
