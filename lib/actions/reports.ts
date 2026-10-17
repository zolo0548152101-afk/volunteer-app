"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { approveMany, decide, editReportByStaff, ReportError, resubmitReport, submitReport, type AbsenceReason, type SubmitInput } from "@/lib/services/reports";
import { NotFoundError } from "@/lib/services/users";
import { deleteAttachment, FileError, saveAttachment } from "@/lib/storage";
import { trimmed as str } from "./_form";

function code(e: unknown): string {
  if (e instanceof ReportError || e instanceof FileError) return e.code;
  if (e instanceof ForbiddenError) return "forbidden";
  if (e instanceof NotFoundError) return "not_found";
  console.error(e);
  return "generic";
}


/** חזרה בטוחה: רק נתיבים פנימיים של המערכת, כדי שלא ישמשו להפניה חיצונית */
const safeBack = (v: string, fallback: string) => (/^\/(reports|student)(\/[A-Za-z0-9_\-/?=&.%]*)?$/.test(v) ? v : fallback);

function inputOf(fd: FormData): SubmitInput {
  const type = str(fd, "type") === "absence" ? "absence" : "volunteering";
  return {
    type, placementId: str(fd, "placementId") || null, volunteerDate: str(fd, "volunteerDate"),
    startTime: str(fd, "startTime") || null, endTime: str(fd, "endTime") || null,
    reportedHours: Number(str(fd, "reportedHours")), studentNotes: str(fd, "studentNotes"),
    absenceReason: (str(fd, "absenceReason") || null) as AbsenceReason | null,
  };
}

async function run(back: string, ok: string, fn: () => Promise<void>) {
  let error: string | undefined;
  try { await fn(); } catch (e) { error = code(e); }
  redirect(error ? `${back}${back.includes("?") ? "&" : "?"}error=${error}` : ok);
}

/** מסמך מצורף להיעדרות (רשות): נשמר לפני הפעולה, ונמחק אם הפעולה נכשלה, כדי לא להשאיר קובץ יתום */
async function withAttachment<T>(fd: FormData, orgId: string, input: SubmitInput, fn: (input: SubmitInput) => Promise<T>): Promise<T> {
  const f = fd.get("attachment");
  const file = input.type === "absence" && f instanceof File && f.size > 0 ? f : null;
  const key = file ? await saveAttachment(file, orgId) : undefined;
  try {
    return await fn(key ? { ...input, attachment: key } : input);
  } catch (e) {
    await deleteAttachment(key);
    throw e;
  }
}

export async function submitReportAction(fd: FormData) {
  const input = inputOf(fd);
  const back = `/student/report${input.type === "absence" ? "?absence=1" : ""}`;
  await run(back, "/student/reports?sent=1", async () => {
    const actor = await requireActor();
    await withAttachment(fd, actor.organizationId, input, (i) => submitReport(db(), actor, i));
  });
}

export async function resubmitReportAction(fd: FormData) {
  const id = str(fd, "reportId");
  await run(`/student/reports/${id}`, "/student/reports?sent=1", async () => {
    const actor = await requireActor();
    const { replacedAttachment } = await withAttachment(fd, actor.organizationId, inputOf(fd), (i) => resubmitReport(db(), actor, id, i));
    await deleteAttachment(replacedAttachment);
  });
}

/** עריכה על ידי הרכז/המנהל: בלי שינוי סטטוס ובלי אישור מחדש */
export async function editReportAction(fd: FormData) {
  const id = str(fd, "reportId");
  const back = safeBack(str(fd, "back"), "/reports");
  await run(`${back}${back.includes("?") ? "&" : "?"}focus=${id}`, `${back}${back.includes("?") ? "&" : "?"}saved=1#${id}`, async () => {
    await editReportByStaff(db(), await requireActor(), id, {
      volunteerDate: str(fd, "volunteerDate"), startTime: str(fd, "startTime") || null, endTime: str(fd, "endTime") || null,
      reportedHours: Number(str(fd, "reportedHours")), approvedHours: Number(str(fd, "approvedHours")), coordinatorNotes: str(fd, "notes"),
    });
  });
}

export async function decideAction(fd: FormData) {
  const id = str(fd, "reportId");
  const back = safeBack(str(fd, "back"), "/reports");
  const kind = str(fd, "kind");
  const notes = str(fd, "notes");
  await run(`${back}${back.includes("?") ? "&" : "?"}focus=${id}`, back, async () => {
    const actor = await requireActor();
    if (kind === "approve") {
      const raw = str(fd, "approvedHours");
      await decide(db(), actor, id, { kind: "approve", approvedHours: raw === "" ? undefined : Number(raw), notes, countsTowardTarget: fd.has("countsTowardTarget") ? str(fd, "countsTowardTarget") === "1" : undefined });
    } else if (kind === "reject" || kind === "needs_correction") await decide(db(), actor, id, { kind, notes });
    else if (kind === "unapprove") await decide(db(), actor, id, { kind: "unapprove", reason: notes });
    else throw new ReportError("bad_transition");
  });
}

/** אישור מרובה של דיווחים ממתינים בשעות שדווחו; חוזר לתיבה עם סיכום */
export async function bulkApproveAction(fd: FormData) {
  const back = safeBack(str(fd, "back"), "/reports");
  const ids = fd.getAll("ids").map(String).filter(Boolean);
  let result = { approved: 0, failed: 0, skipped: 0 };
  let error: string | undefined;
  try { if (ids.length > 0) result = await approveMany(db(), await requireActor(), ids); } catch (e) { error = code(e); }
  const sep = back.includes("?") ? "&" : "?";
  redirect(error ? `${back}${sep}error=${error}` : `${back}${sep}bulk=${result.approved}-${result.failed + result.skipped}`);
}
