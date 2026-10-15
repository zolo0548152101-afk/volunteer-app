"use server";

import { AuthError } from "next-auth";
import { and, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/password";
import { safeNext, sendLink } from "@/lib/services/auth-links";
import { setPasswordFromToken } from "@/lib/services/credentials";
import type { TokenKind } from "@/lib/services/tokens";

export type FormState = { error?: "invalid" | "weak" | "token" | "generic"; done?: boolean };

const MIN_PASSWORD = 8;

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  try {
    await signIn("credentials", { email, password, redirectTo: safeNext(String(formData.get("next") ?? "")) });
  } catch (e) {
    if (e instanceof AuthError) return { error: e.type === "CredentialsSignin" ? "invalid" : "generic" };
    throw e; // ה-redirect של Next זורק, וזה תקין
  }
  return {};
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

/** תמיד אותה תשובה, בין אם המייל קיים ובין אם לא */
export async function requestResetAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.string().email().safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { error: "invalid" };
  const [u] = await db()
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = ${parsed.data.toLowerCase()}`, inArray(users.status, ["active", "invited"])))
    .limit(1);
  if (u) await sendLink(u, "password_reset");
  return { done: true };
}

/** הגדרת סיסמה מקישור הזמנה או איפוס. הטוקן נצרך רק אם הסיסמה תקינה. */
export async function setPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const kind = String(formData.get("kind")) as TokenKind;
  if (kind !== "invite" && kind !== "password_reset") return { error: "generic" };
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD || password !== String(formData.get("confirm") ?? "")) return { error: "weak" };
  const passwordHash = await hashPassword(password);
  let ok = false;
  try {
    ok = await setPasswordFromToken(db(), { kind, raw: String(formData.get("token") ?? ""), passwordHash });
  } catch {
    ok = false; // rollback של משתמש מושבת
  }
  if (!ok) return { error: "token" };
  return { done: true };
}
