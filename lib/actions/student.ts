"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { CustomFieldError, customInputFromForm, saveValues } from "@/lib/services/custom-fields";
import { completeProfile, registrationOrgId, saveSection, saveStudentByStaff, submitApplication, StudentError, type Section } from "@/lib/services/students";
import { getLocale } from "next-intl/server";
import { clientIp, isLimited, limitKey, recordAttempt } from "@/lib/services/rate-limit";

export type RegisterState = { error?: string };

/** טופס הרשמה פתוח לתוכנית. אין חשבון וסיסמה: הכניסה נפתחת אחרי הראיון (ראו finalizeAction). */
export async function applyAction(_: RegisterState, fd: FormData): Promise<RegisterState> {
  const str = (k: string) => String(fd.get(k) ?? "");
  // שדה פיתיון שבני אדם לא רואים: בוט שמילא אותו מקבל "תודה" ולא נשמר דבר
  if (str("website")) redirect("/register/thanks");
  // הטופס פתוח לכולם: מגבילים לפי כתובת. 30 לשעה ולא פחות: לקוחות של אותו מפעיל סלולרי (NAT) חולקים כתובת
  const ipKey = limitKey("register:ip", clientIp(await headers()));
  if (await isLimited(db(), ipKey, 30, 3600)) return { error: "rate_limited" };
  await recordAttempt(db(), ipKey);
  try {
    const locale = (await getLocale()) === "en" ? "en" : "he";
    const profile: Record<string, string | string[]> = {};
    for (const k of new Set(fd.keys())) {
      if (k.startsWith("cf_") || k.startsWith("$ACTION") || ["firstName", "lastName", "email", "phone", "website"].includes(k)) continue;
      const all = fd.getAll(k).map(String);
      profile[k] = all.length > 1 || ["preferredTypes", "availableDays"].includes(k) ? all : all[0];
    }
    await submitApplication(db(), await registrationOrgId(db()), {
      firstName: str("firstName"), lastName: str("lastName"), email: str("email"), phone: str("phone"), locale,
      profile, custom: customInputFromForm(fd),
    });
  } catch (e) {
    if (e instanceof StudentError) return { error: e.code };
    if (e instanceof CustomFieldError) return { error: "incomplete" };
    console.error(e);
    return { error: "generic" };
  }
  // גם כשהמייל כבר קיים: אותה תשובה, כדי שהטופס לא יחשוף מי רשום
  redirect("/register/thanks");
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

/** עריכת פרטי סטודנט מכרטיס הסטודנט (מנהל / רכז של הסטודנט / מראיין) */
export async function saveStudentByStaffAction(fd: FormData) {
  const id = String(fd.get("studentId") ?? "");
  const back = /^[0-9a-f-]{36}$/i.test(id) ? `/students/${id}` : "/";
  let error: string | undefined;
  try {
    const section = String(fd.get("section"));
    if (!SECTIONS.includes(section as Section)) throw new Error("bad section");
    const actor = await requireActor();
    const data: Record<string, string | string[]> = {};
    for (const k of new Set(fd.keys())) {
      if (k.startsWith("cf_") || k.startsWith("$ACTION")) continue;
      const all = fd.getAll(k).map(String);
      data[k] = all.length > 1 || ["preferredTypes", "availableDays"].includes(k) ? all : all[0];
    }
    await saveStudentByStaff(db(), actor, id, section as Section, data);
    await saveValues(db(), actor, "student", id, customInputFromForm(fd));
  } catch (e) {
    error = errCode(e);
  }
  revalidatePath(back);
  redirect(error ? `${back}?error=${error}` : `${back}?done=saved`);
}
