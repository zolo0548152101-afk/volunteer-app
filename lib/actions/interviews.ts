"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { cancelInterview, ContractError, finalizeInterview, getDraft, InterviewError, saveDraft, startInterview, type DraftLine, type InterviewFields } from "@/lib/services/interviews";
import { defaultWeeklyHours, round2 } from "@/lib/services/capacity";
import { DAYS, type Day } from "@/lib/services/places";
import { NotFoundError } from "@/lib/services/users";
import { loadWindows } from "@/lib/db/queries/capacity";

function code(e: unknown): string {
  if (e instanceof ContractError) return e.evaluation.blocked ? "contract_blocked" : "needs_override";
  if (e instanceof InterviewError) return e.code;
  if (e instanceof ForbiddenError) return "forbidden";
  if (e instanceof NotFoundError) return "not_found";
  console.error(e);
  return "generic";
}

async function go(back: string, fn: () => Promise<string | void>) {
  let error: string | undefined;
  let to: string | void = undefined;
  try { to = await fn(); } catch (e) { error = code(e); }
  redirect(error ? `${back}${back.includes("?") ? "&" : "?"}error=${error}` : to || back);
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

function fieldsOf(fd: FormData): InterviewFields {
  const imp = str(fd, "generalImpression");
  return {
    interviewDate: str(fd, "interviewDate"), notes: str(fd, "notes"), preferencesDiscussed: str(fd, "preferencesDiscussed"), constraintsDiscussed: str(fd, "constraintsDiscussed"),
    placementDecisionNotes: str(fd, "placementDecisionNotes"), summary: str(fd, "summary"),
    generalImpression: (["very_suitable", "suitable", "conditionally_suitable", "not_suitable"].includes(imp) ? imp : null) as InterviewFields["generalImpression"],
  };
}

/** שורות מהטופס: l_<i>_<שדה>. שורה עם remove=<i> נשמטת */
function linesOf(fd: FormData): DraftLine[] {
  const remove = str(fd, "remove");
  const idx = [...new Set([...fd.keys()].map((k) => /^l_(\d+)_/.exec(k)?.[1]).filter((x): x is string => !!x))].sort((a, b) => Number(a) - Number(b));
  return idx.filter((i) => i !== remove).map((i) => ({
    timeWindowId: str(fd, `l_${i}_window`), slots: Number(str(fd, `l_${i}_slots`)), weeklyHours: Number(str(fd, `l_${i}_weekly`)),
    assignedDays: fd.getAll(`l_${i}_days`).map(String).filter((d): d is Day => (DAYS as string[]).includes(d)),
    assignedHours: str(fd, `l_${i}_hours`), defaultReportHours: numOrNull(str(fd, `l_${i}_report`)), description: str(fd, `l_${i}_desc`),
  }));
}

export async function startInterviewAction(fd: FormData) {
  const studentId = str(fd, "studentId");
  const kind = str(fd, "kind") === "reassignment" ? "reassignment" : "interview";
  await go(`/students/${studentId}`, async () => `/interviews/${await startInterview(db(), await requireActor(), studentId, kind)}`);
}

export async function saveDraftAction(fd: FormData) {
  const id = str(fd, "interviewId");
  await go(`/interviews/${id}`, async () => { await saveDraft(db(), await requireActor(), id, { fields: fieldsOf(fd), lines: linesOf(fd) }); });
}

/** הוספת חלון כשורה חדשה עם ברירות מחדל מהחלון; שומר גם את מה שכבר הוזן בשאר הטיוטה */
export async function addLineAction(fd: FormData) {
  const id = str(fd, "interviewId");
  const windowId = str(fd, "windowId");
  await go(`/interviews/${id}`, async () => {
    const actor = await requireActor();
    const d = await getDraft(db(), actor, id);
    const [w] = await loadWindows(db(), actor.organizationId, { windowIds: [windowId] });
    if (!w) throw new NotFoundError();
    const { placeTimeWindows } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const [full] = await db().select().from(placeTimeWindows).where(eq(placeTimeWindows.id, windowId));
    const slots = Math.min(1, Math.max(0.25, full.slots));
    const weekly = defaultWeeklyHours(w, slots);
    const days = full.days as Day[];
    const lines: DraftLine[] = d.lines.map((l) => ({
      timeWindowId: l.timeWindowId, slots: l.slots, weeklyHours: l.weeklyHours, assignedDays: l.assignedDays as Day[], assignedHours: l.assignedHours,
      defaultReportHours: l.defaultReportHours, description: l.description,
    }));
    lines.push({
      timeWindowId: windowId, slots, weeklyHours: weekly, assignedDays: days, assignedHours: full.startTime && full.endTime ? `${full.startTime.slice(0, 5)}–${full.endTime.slice(0, 5)}` : null,
      defaultReportHours: round2(weekly / Math.max(1, days.length)), description: full.taskDescription,
    });
    await saveDraft(db(), actor, id, { lines });
  });
}

export async function finalizeAction(fd: FormData) {
  const id = str(fd, "interviewId");
  await go(`/interviews/${id}`, async () => {
    const actor = await requireActor();
    // שומר את מה שמוצג בטופס לפני הסגירה, כדי שהסגירה תבוצע על מה שהמשתמש רואה
    await saveDraft(db(), actor, id, { fields: fieldsOf(fd), lines: linesOf(fd) });
    const d = await getDraft(db(), actor, id);
    await finalizeInterview(db(), actor, id, { coordinatorId: str(fd, "coordinatorId") || null, overrideReason: str(fd, "overrideReason") });
    return `/students/${d.interview.studentId}?done=1`;
  });
}

export async function cancelAction(fd: FormData) {
  const id = str(fd, "interviewId");
  const studentId = str(fd, "studentId");
  await go(`/interviews/${id}`, async () => { await cancelInterview(db(), await requireActor(), id); return `/students/${studentId}`; });
}
