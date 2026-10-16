"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { CustomFieldError, customInputFromForm, saveValues } from "@/lib/services/custom-fields";
import { completeProfile, registerStudent, registrationOrgId, saveSection, StudentError, type Section } from "@/lib/services/students";
import { getLocale } from "next-intl/server";
import { clientIp, isLimited, limitKey, recordAttempt } from "@/lib/services/rate-limit";

export type RegisterState = { error?: string };

export async function registerAction(_: RegisterState, fd: FormData): Promise<RegisterState> {
  const str = (k: string) => String(fd.get(k) ?? "");
  if (str("password") !== str("confirm")) return { error: "weak_password" };
  const email = str("email").trim();
  // הרשמה פתוחה לכולם: מגבילים לפי כתובת, כדי שלא יציפו חשבונות (וגם לא יסרקו מיילים רשומים)
  const ipKey = limitKey("register:ip", clientIp(await headers()));
  if (await isLimited(db(), ipKey, 10, 3600)) return { error: "rate_limited" };
  await recordAttempt(db(), ipKey);
  try {
    const locale = (await getLocale()) === "en" ? "en" : "he";
    await registerStudent(db(), await registrationOrgId(db()), { firstName: str("firstName"), lastName: str("lastName"), email, phone: str("phone"), password: str("password"), locale });
  } catch (e) {
    if (e instanceof StudentError) return { error: e.code };
    console.error(e);
    return { error: "generic" };
  }
  try {
    await signIn("credentials", { email, password: str("password"), redirectTo: "/student/setup/1" });
  } catch (e) {
    if (e instanceof AuthError) return { error: "generic" };
    throw e;
  }
  return {};
}

function errCode(e: unknown): string {
  if (e instanceof StudentError) return e.code;
  if (e instanceof CustomFieldError) return `cf_${e.code}`;
  if (e instanceof ForbiddenError) return "forbidden";
  console.error(e);
  return "generic";
}

const SECTIONS: Section[] = ["academic", "prefs", "bank"];
const safeBack = (v: string, fallback: string) => (v === "/student" || (v.startsWith("/student/") && !v.startsWith("//")) ? v : fallback);

/** שמירת חלק מהפרופיל (גם מאשף ההרשמה וגם מ"הפרופיל שלי") */
export async function saveSectionAction(fd: FormData) {
  const section = String(fd.get("section")) as Section;
  const back = safeBack(String(fd.get("back") ?? ""), "/student/profile");
  const next = safeBack(String(fd.get("next") ?? ""), back);
  const finish = fd.get("finish") === "1";
  let error: string | undefined;
  try {
    if (!SECTIONS.includes(section)) throw new Error("bad section");
    const actor = await requireActor();
    const data: Record<string, string | string[]> = {};
    for (const k of new Set(fd.keys())) {
      if (k.startsWith("cf_") || k.startsWith("$ACTION")) continue;
      const all = fd.getAll(k).map(String);
      data[k] = all.length > 1 || ["preferredTypes", "availableDays"].includes(k) ? all : all[0];
    }
    await saveSection(db(), actor, section, data);
    await saveValues(db(), actor, "student", actor.id, customInputFromForm(fd), { enforceRequired: true });
    if (finish) await completeProfile(db(), actor);
  } catch (e) {
    error = errCode(e);
  }
  revalidatePath("/student", "layout");
  redirect(error ? `${back}${back.includes("?") ? "&" : "?"}error=${error}` : next);
}
