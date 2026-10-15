/**
 * ראיון ושיבוץ (PRD 7.2). הלב של המערכת.
 *  - טיוטה: שורות שיבוץ נשמרות כ-placements לא פעילים המקושרים לראיון. אפשר לערוך חופשי.
 *  - סגירה: טרנזקציה אחת. נועלת את הסטודנט והחלונות, מחשבת מחדש את שני הבנקים על נתונים עדכניים,
 *    משביתה שיבוצים קודמים, מפעילה את החדשים, בוחרת רכז אם אין, ורושמת הכל בלוג.
 *  - ראיון סגור לא נערך. היסטוריה לא נמחקת.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db";
import { academicYears, hourReports, interviews, placeTimeWindows, placements, programs, settings, studentProfiles, users, volunteerPlaces } from "@/lib/db/schema";
import { loadActivePlacements, loadWindows } from "@/lib/db/queries/capacity";
import { assertCan, can, ForbiddenError, type SessionUser } from "@/lib/permissions";
import { audited, writeAudit } from "@/lib/services/audit";
import { approvedHoursTotal, defaultWeeklyHours, evaluateContract, round2, studentTarget, windowUsage, type ContractEvaluation, type ProposedPlacement } from "@/lib/services/capacity";
import { notify } from "@/lib/services/notify";
import { DAYS, type Day } from "@/lib/services/places";
import { NotFoundError, subjectOf } from "@/lib/services/users";

export type InterviewCode =
  | "not_draft" | "no_lines" | "need_coordinator" | "bad_coordinator" | "override_forbidden" | "override_reason_required"
  | "already_has_draft" | "bad_line" | "not_student" | "needs_override";

export class InterviewError extends Error {
  constructor(public code: InterviewCode) {
    super(code);
    this.name = "InterviewError";
  }
}
/** החוזה לא עובר ולידציה: חסימה (או חריגה שדורשת אישור מנהל) */
export class ContractError extends Error {
  constructor(public evaluation: ContractEvaluation) {
    super("contract");
    this.name = "ContractError";
  }
}

export type DraftLine = {
  timeWindowId: string; slots: number; weeklyHours: number; assignedDays: Day[];
  assignedHours?: string | null; defaultReportHours?: number | null; description?: string | null;
};
export type InterviewFields = {
  interviewDate?: string | null; generalImpression?: "very_suitable" | "suitable" | "conditionally_suitable" | "not_suitable" | null;
  notes?: string | null; preferencesDiscussed?: string | null; constraintsDiscussed?: string | null; placementDecisionNotes?: string | null; summary?: string | null;
};

const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null);
const todayIL = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });

/** ההרשאה לפעול על ראיון/שיבוץ של סטודנט: ראיון = מראיין/מנהל; שיבוץ מחדש = רכז שלו או מנהל */
function authorize(actor: SessionUser, kind: "interview" | "reassignment", student: { id: string; organizationId: string; coordinatorId: string | null }, action: "create" | "update") {
  if (kind === "interview") assertCan(actor, action, "interview", { organizationId: actor.organizationId });
  else {
    // שיבוץ מחדש: הרכז של הסטודנט או מנהל (מראיין שיבוץ עושה דרך ראיון)
    if (!actor.roles.includes("manager") && !actor.roles.includes("coordinator")) throw new ForbiddenError();
    assertCan(actor, action, "placement", subjectOf(student));
  }
}

async function loadStudent(tx: Db | Tx, orgId: string, studentId: string, lock = false) {
  const q = tx.select({ id: users.id, organizationId: users.organizationId, roles: users.roles, status: users.status, coordinatorId: users.coordinatorId, firstName: users.firstName, lastName: users.lastName, email: users.email, locale: users.locale })
    .from(users).where(and(eq(users.id, studentId), eq(users.organizationId, orgId))).limit(1);
  const [u] = lock ? await q.for("update") : await q;
  if (!u) throw new NotFoundError();
  if (!u.roles.includes("student")) throw new InterviewError("not_student");
  return u;
}

/** פרטי הבנק של הסטודנט לחישוב: יעד, אושר, תאריכים, סף סובלנות מההגדרות */
export async function loadBankInput(tx: Db | Tx, orgId: string, studentId: string) {
  const [prof] = await tx.select({ override: studentProfiles.targetHoursOverride, trackHours: programs.requiredHours })
    .from(studentProfiles).leftJoin(programs, eq(programs.id, studentProfiles.trackId)).where(eq(studentProfiles.userId, studentId)).limit(1);
  const [year] = await tx.select({ id: academicYears.id, end: academicYears.endDate }).from(academicYears)
    .where(and(eq(academicYears.organizationId, orgId), eq(academicYears.isCurrent, true))).limit(1);
  if (!prof || prof.trackHours === null || !year) return undefined;
  const reports = await tx.select({ academicYearId: hourReports.academicYearId, reportType: hourReports.reportType, status: hourReports.status, approvedHours: hourReports.approvedHours, countsTowardTarget: hourReports.countsTowardTarget })
    .from(hourReports).where(and(eq(hourReports.studentId, studentId), eq(hourReports.organizationId, orgId)));
  const [st] = await tx.select({ tol: settings.capacityToleranceHours }).from(settings).where(eq(settings.organizationId, orgId));
  return { target: studentTarget(prof.trackHours, prof.override), approved: approvedHoursTotal(reports, year.id), asOf: todayIL(), yearEnd: String(year.end), toleranceHours: st?.tol };
}

async function evaluate(tx: Db | Tx, orgId: string, studentId: string, lines: ProposedPlacement[]): Promise<ContractEvaluation> {
  const ids = [...new Set(lines.map((l) => l.timeWindowId))];
  const windows = await loadWindows(tx, orgId, { windowIds: ids });
  const active = await loadActivePlacements(tx, orgId, ids);
  return evaluateContract({ studentId, proposed: lines, windows, activePlacements: active, bank: await loadBankInput(tx, orgId, studentId) });
}

/* ───────────── טיוטה ───────────── */

export async function startInterview(db: Db, actor: SessionUser, studentId: string, kind: "interview" | "reassignment"): Promise<string> {
  return db.transaction(async (tx) => {
    const student = await loadStudent(tx, actor.organizationId, studentId, true);
    authorize(actor, kind, student, "create");
    const [existing] = await tx.select().from(interviews).where(and(eq(interviews.studentId, studentId), eq(interviews.status, "draft"))).limit(1);
    if (existing) {
      if (existing.kind !== kind) throw new InterviewError("already_has_draft");
      return existing.id;
    }
    const [iv] = await tx.insert(interviews).values({ organizationId: actor.organizationId, studentId, interviewerId: actor.id, kind, interviewDate: todayIL() }).returning({ id: interviews.id });
    // נקודת פתיחה: החוזה הנוכחי של הסטודנט, כדי לערוך אותו ולא להתחיל מאפס
    const current = await tx.select().from(placements).where(and(eq(placements.studentId, studentId), eq(placements.isActive, true)));
    for (const p of current) {
      await tx.insert(placements).values({
        organizationId: actor.organizationId, interviewId: iv.id, studentId, placeId: p.placeId, timeWindowId: p.timeWindowId, slots: p.slots, weeklyHours: p.weeklyHours,
        assignedDays: p.assignedDays, assignedHours: p.assignedHours, defaultReportHours: p.defaultReportHours, description: p.description, isActive: false, createdBy: actor.id,
      });
    }
    await writeAudit(tx, { organizationId: actor.organizationId, actorId: actor.id }, { entity: "interview", entityId: iv.id, action: "create" }, null, { studentId, kind });
    return iv.id;
  });
}

async function loadDraft(tx: Tx, actor: SessionUser, interviewId: string) {
  const [iv] = await tx.select().from(interviews).where(and(eq(interviews.id, interviewId), eq(interviews.organizationId, actor.organizationId))).for("update").limit(1);
  if (!iv) throw new NotFoundError();
  const student = await loadStudent(tx, actor.organizationId, iv.studentId, true);
  authorize(actor, iv.kind, student, "update");
  return { iv, student };
}

export async function saveDraft(db: Db, actor: SessionUser, interviewId: string, input: { fields?: InterviewFields; lines: DraftLine[] }): Promise<ContractEvaluation> {
  return db.transaction(async (tx) => {
    const { iv } = await loadDraft(tx, actor, interviewId);
    if (iv.status !== "draft") throw new InterviewError("not_draft");
    for (const l of input.lines) {
      if (!Number.isFinite(l.slots) || !Number.isFinite(l.weeklyHours)) throw new InterviewError("bad_line");
    }
    const wins = await loadWindowRows(tx, actor.organizationId, input.lines.map((l) => l.timeWindowId));
    if (input.lines.some((l) => !wins.has(l.timeWindowId))) throw new InterviewError("bad_line");
    if (input.fields && iv.kind === "interview") {
      const f = input.fields;
      await tx.update(interviews).set({
        interviewDate: clean(f.interviewDate) ?? iv.interviewDate, generalImpression: f.generalImpression ?? null, notes: clean(f.notes), preferencesDiscussed: clean(f.preferencesDiscussed),
        constraintsDiscussed: clean(f.constraintsDiscussed), placementDecisionNotes: clean(f.placementDecisionNotes), summary: clean(f.summary),
      }).where(eq(interviews.id, interviewId));
    }
    await tx.delete(placements).where(and(eq(placements.interviewId, interviewId), eq(placements.isActive, false)));
    for (const l of input.lines) {
      const w = wins.get(l.timeWindowId)!;
      await tx.insert(placements).values({
        organizationId: actor.organizationId, interviewId, studentId: iv.studentId, placeId: w.placeId, timeWindowId: l.timeWindowId, slots: round2(l.slots), weeklyHours: round2(l.weeklyHours),
        assignedDays: l.assignedDays.filter((d) => DAYS.includes(d)), assignedHours: clean(l.assignedHours), defaultReportHours: l.defaultReportHours ?? null,
        description: clean(l.description), isActive: false, createdBy: actor.id,
      });
    }
    return evaluate(tx, actor.organizationId, iv.studentId, input.lines.map((l) => ({ timeWindowId: l.timeWindowId, slots: l.slots, weeklyHours: l.weeklyHours })));
  });
}

async function loadWindowRows(tx: Db | Tx, orgId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, { placeId: string }>();
  const rows = await tx.select({ id: placeTimeWindows.id, placeId: placeTimeWindows.placeId }).from(placeTimeWindows)
    .where(and(eq(placeTimeWindows.organizationId, orgId), inArray(placeTimeWindows.id, ids)));
  return new Map(rows.map((r) => [r.id, r]));
}

export async function cancelInterview(db: Db, actor: SessionUser, interviewId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { iv } = await loadDraft(tx, actor, interviewId);
    if (iv.status !== "draft") throw new InterviewError("not_draft");
    await tx.delete(placements).where(and(eq(placements.interviewId, interviewId), eq(placements.isActive, false)));
    await audited(tx, { organizationId: actor.organizationId, actorId: actor.id }, { entity: "interview", entityId: interviewId, action: "cancel" },
      async () => ({ status: "draft" }), async () => { await tx.update(interviews).set({ status: "cancelled" }).where(eq(interviews.id, interviewId)); return { status: "cancelled" }; });
  });
}

/* ───────────── סגירה ───────────── */

export type FinalizeInput = { coordinatorId?: string | null; overrideReason?: string | null };
export type FinalizeResult = { coordinatorId: string; deactivated: number; activated: number; evaluation: ContractEvaluation };

export async function finalizeInterview(db: Db, actor: SessionUser, interviewId: string, input: FinalizeInput = {}): Promise<FinalizeResult> {
  const ctx = { organizationId: actor.organizationId, actorId: actor.id };
  const out = await db.transaction(async (tx) => {
    const { iv, student } = await loadDraft(tx, actor, interviewId);
    if (iv.status !== "draft") throw new InterviewError("not_draft");
    const lines = await tx.select().from(placements).where(and(eq(placements.interviewId, interviewId), eq(placements.isActive, false)));
    if (lines.length === 0) throw new InterviewError("no_lines");

    // נעילת חלונות בסדר קבוע: שני סגירות במקביל על אותו חלון לא יחצו את המכסה
    const windowIds = [...new Set(lines.map((l) => l.timeWindowId))].sort();
    await tx.execute(sql`SELECT id FROM place_time_windows WHERE id IN (${sql.join(windowIds.map((id) => sql`${id}`), sql`, `)}) ORDER BY id FOR UPDATE`);

    const evaluation = await evaluate(tx, actor.organizationId, iv.studentId, lines.map((l) => ({ timeWindowId: l.timeWindowId, slots: l.slots, weeklyHours: l.weeklyHours })));
    if (evaluation.blocked) throw new ContractError(evaluation);
    if (evaluation.needsManagerOverride) {
      if (!can(actor, "manage", "user", { organizationId: actor.organizationId })) throw new ContractError(evaluation);
      if (!clean(input.overrideReason)) throw new InterviewError("override_reason_required");
      await writeAudit(tx, ctx, { entity: "interview", entityId: interviewId, action: "override", reason: clean(input.overrideReason)! }, null, { issues: evaluation.issues.filter((i) => i.severity === "warn").map((i) => i.code) });
    }

    let coordinatorId = student.coordinatorId;
    if (!coordinatorId) {
      if (!input.coordinatorId) throw new InterviewError("need_coordinator");
      const [c] = await tx.select({ roles: users.roles, status: users.status }).from(users).where(and(eq(users.id, input.coordinatorId), eq(users.organizationId, actor.organizationId))).limit(1);
      if (!c || !c.roles.includes("coordinator") || c.status !== "active") throw new InterviewError("bad_coordinator");
      assertCan(actor, "assign", "user", subjectOf(student));
      await audited(tx, ctx, { entity: "user", entityId: student.id, action: "assign_coordinator" }, async () => ({ coordinatorId: null }),
        async () => { await tx.update(users).set({ coordinatorId: input.coordinatorId! }).where(eq(users.id, student.id)); return { coordinatorId: input.coordinatorId }; });
      coordinatorId = input.coordinatorId;
    }

    const today = todayIL();
    const previous = await tx.select({ id: placements.id }).from(placements).where(and(eq(placements.studentId, student.id), eq(placements.isActive, true)));
    if (previous.length) {
      await tx.update(placements).set({ isActive: false, endedAt: today }).where(inArray(placements.id, previous.map((p) => p.id)));
      for (const p of previous) await writeAudit(tx, ctx, { entity: "placement", entityId: p.id, action: "deactivate" }, { isActive: true }, { isActive: false, interviewId });
    }
    await tx.update(placements).set({ isActive: true, startedAt: today }).where(and(eq(placements.interviewId, interviewId), eq(placements.isActive, false)));
    for (const l of lines) await writeAudit(tx, ctx, { entity: "placement", entityId: l.id, action: "activate" }, { isActive: false }, { isActive: true, timeWindowId: l.timeWindowId, slots: l.slots, weeklyHours: l.weeklyHours });
    await tx.update(interviews).set({ status: "finalized", finalizedAt: new Date() }).where(eq(interviews.id, interviewId));
    await writeAudit(tx, ctx, { entity: "interview", entityId: interviewId, action: "finalize" }, { status: "draft" }, { status: "finalized", placements: lines.length });
    return { coordinatorId, deactivated: previous.length, activated: lines.length, evaluation, student };
  });

  // הודעות אחרי הצלחת הטרנזקציה בלבד; notify לא זורק
  const { student, ...result } = out;
  const [coord] = await db.select({ email: users.email, locale: users.locale }).from(users).where(eq(users.id, result.coordinatorId));
  await notify({ channel: "email", to: student.email, template: "placement.student", data: { interviewId }, locale: student.locale });
  if (coord) await notify({ channel: "email", to: coord.email, template: "placement.coordinator", data: { studentId: student.id }, locale: coord.locale });
  return result;
}

/* ───────────── תצוגות עזר ───────────── */

export type CandidateWindow = {
  windowId: string; placeId: string; placeName: string; city: string | null; category: string | null; label: string; days: Day[]; startTime: string | null; endTime: string | null;
  hoursPerSlot: number; slots: number; remainingSlots: number; remainingHours: number; taskDescription: string | null; overlapDays: Day[]; typeMatch: boolean; score: number;
};

/** חלונות פנויים לשיבוץ, ממוינים לפי חפיפה לזמינות הסטודנט (ימים) ולהתאמת סוג ההתנדבות */
export async function listCandidateWindows(db: Db, actor: SessionUser, studentId: string, filters: { city?: string; category?: string; day?: string; q?: string } = {}): Promise<CandidateWindow[]> {
  const student = await loadStudent(db, actor.organizationId, studentId);
  assertCan(actor, "read", "time_window", { organizationId: actor.organizationId });
  assertCan(actor, "read", "student_profile", subjectOf(student));
  const [prof] = await db.select({ days: studentProfiles.availableDays, types: studentProfiles.preferredTypes }).from(studentProfiles).where(eq(studentProfiles.userId, studentId));
  const rows = await db.select({
    w: placeTimeWindows, p: { id: volunteerPlaces.id, name: volunteerPlaces.name, city: volunteerPlaces.city, category: volunteerPlaces.category },
  }).from(placeTimeWindows).innerJoin(volunteerPlaces, eq(volunteerPlaces.id, placeTimeWindows.placeId))
    .where(and(eq(placeTimeWindows.organizationId, actor.organizationId), eq(placeTimeWindows.isActive, true), eq(volunteerPlaces.status, "active")));
  const active = await loadActivePlacements(db, actor.organizationId, rows.map((r) => r.w.id));
  const mine = new Set((prof?.days ?? []) as Day[]);
  const q = filters.q?.trim();
  return rows
    .map(({ w, p }) => {
      const u = windowUsage({ id: w.id, placeId: w.placeId, slots: w.slots, hoursPerSlot: w.hoursPerSlot, isActive: w.isActive }, active, { excludeStudentId: studentId });
      const days = w.days as Day[];
      const overlap = days.filter((d) => mine.has(d));
      const typeMatch = !!p.category && (prof?.types ?? []).includes(p.category);
      const score = (days.length ? overlap.length / days.length : 0.5) * 10 + (typeMatch ? 3 : 0);
      return { windowId: w.id, placeId: p.id, placeName: p.name, city: p.city, category: p.category, label: w.label, days, startTime: w.startTime, endTime: w.endTime, hoursPerSlot: w.hoursPerSlot,
        slots: w.slots, remainingSlots: u.remainingSlots, remainingHours: u.remainingHours, taskDescription: w.taskDescription, overlapDays: overlap, typeMatch, score } satisfies CandidateWindow;
    })
    .filter((c) => c.remainingSlots > 0)
    .filter((c) => !filters.city || c.city === filters.city)
    .filter((c) => !filters.category || c.category === filters.category)
    .filter((c) => !filters.day || c.days.includes(filters.day as Day))
    .filter((c) => !q || `${c.placeName} ${c.label} ${c.taskDescription ?? ""}`.includes(q))
    .sort((a, b) => b.score - a.score || a.placeName.localeCompare(b.placeName, "he"));
}

export type DraftView = {
  interview: typeof interviews.$inferSelect;
  lines: (typeof placements.$inferSelect & { placeName: string; windowLabel: string })[];
  evaluation: ContractEvaluation;
};

export async function getDraft(db: Db, actor: SessionUser, interviewId: string): Promise<DraftView> {
  const [iv] = await db.select().from(interviews).where(and(eq(interviews.id, interviewId), eq(interviews.organizationId, actor.organizationId))).limit(1);
  if (!iv) throw new NotFoundError();
  const student = await loadStudent(db, actor.organizationId, iv.studentId);
  if (iv.kind === "interview") assertCan(actor, "read", "interview", { organizationId: actor.organizationId });
  else assertCan(actor, "read", "placement", subjectOf(student));
  const lines = await db.select({ p: placements, placeName: volunteerPlaces.name, windowLabel: placeTimeWindows.label }).from(placements)
    .innerJoin(volunteerPlaces, eq(volunteerPlaces.id, placements.placeId)).innerJoin(placeTimeWindows, eq(placeTimeWindows.id, placements.timeWindowId))
    .where(eq(placements.interviewId, interviewId)).orderBy(asc(placements.createdAt));
  const evaluation = await evaluate(db, actor.organizationId, iv.studentId, lines.filter((l) => !l.p.isActive || iv.status === "draft").map((l) => ({ timeWindowId: l.p.timeWindowId, slots: l.p.slots, weeklyHours: l.p.weeklyHours })));
  return { interview: iv, lines: lines.map((l) => ({ ...l.p, placeName: l.placeName, windowLabel: l.windowLabel })), evaluation };
}

/** היסטוריית ראיונות ושיבוצים של סטודנט (כרטיס הסטודנט) */
export async function studentHistory(db: Db, actor: SessionUser, studentId: string) {
  const student = await loadStudent(db, actor.organizationId, studentId);
  assertCan(actor, "read", "placement", subjectOf(student));
  const ivs = await db.select().from(interviews).where(and(eq(interviews.studentId, studentId), eq(interviews.organizationId, actor.organizationId))).orderBy(desc(interviews.createdAt));
  const pls = await db.select({ p: placements, placeName: volunteerPlaces.name, windowLabel: placeTimeWindows.label }).from(placements)
    .innerJoin(volunteerPlaces, eq(volunteerPlaces.id, placements.placeId)).innerJoin(placeTimeWindows, eq(placeTimeWindows.id, placements.timeWindowId))
    .where(and(eq(placements.studentId, studentId), eq(placements.organizationId, actor.organizationId))).orderBy(desc(placements.createdAt));
  // ראיון בטיוטה נראה רק למי שרשאי לראיינים
  const canSeeIv = can(actor, "read", "interview", { organizationId: actor.organizationId });
  return {
    interviews: canSeeIv ? ivs : ivs.filter((i) => i.kind === "reassignment" && i.status !== "draft"),
    placements: pls.filter((x) => x.p.isActive || ivs.find((i) => i.id === x.p.interviewId)?.status === "finalized").map((x) => ({ ...x.p, placeName: x.placeName, windowLabel: x.windowLabel })),
  };
}

/** רכזים פעילים עם מספר הסטודנטים שלהם, לבחירה בסגירת ראיון */
export async function listCoordinatorsWithLoad(db: Db, actor: SessionUser) {
  assertCan(actor, "assign", "user", { organizationId: actor.organizationId });
  const res = await db.execute<{ id: string; first_name: string; last_name: string; students: number }>(sql`
    SELECT c.id, c.first_name, c.last_name, (SELECT count(*)::int FROM users s WHERE s.coordinator_id = c.id) AS students
    FROM users c WHERE c.organization_id = ${actor.organizationId} AND 'coordinator' = ANY(c.roles) AND c.status = 'active' ORDER BY students ASC, c.first_name`);
  return res.rows.map((r) => ({ id: r.id, name: `${r.first_name} ${r.last_name}`, students: r.students }));
}

export { ForbiddenError, defaultWeeklyHours };
