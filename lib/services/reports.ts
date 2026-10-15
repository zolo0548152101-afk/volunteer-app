/**
 * דיווחי שעות (PRD 7.3). 
 *  - הסטודנט מגיש דיווח התנדבות (מושתל מהחוזה) או היעדרות.
 *  - reported_hours לא נדרס לעולם. הרכז משנה רק approved_hours.
 *  - רק status = approved נספר ליעד.
 *  - מעברי מצב: pending → approved | rejected | needs_correction; needs_correction → pending (הסטודנט מתקן);
 *    approved → pending (ביטול אישור, סיבה חובה ונרשמת).
 *  - כל מעבר נעשה תחת נעילת שורה ורשום בלוג בתוך אותה טרנזקציה.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db";
import { academicYears, hourReports, placeTimeWindows, placements, programs, studentProfiles, users, volunteerPlaces } from "@/lib/db/schema";
import { assertCan, can, type SessionUser } from "@/lib/permissions";
import { writeAudit } from "@/lib/services/audit";
import { round2 } from "@/lib/services/capacity";
import { notify } from "@/lib/services/notify";
import { NotFoundError } from "@/lib/services/users";

export type ReportCode =
  | "bad_date" | "future_date" | "outside_year" | "no_year" | "bad_hours" | "bad_time" | "day_over_max" | "duplicate"
  | "not_your_placement" | "not_editable" | "reason_required" | "bad_transition" | "bad_reason" | "not_a_student";

export class ReportError extends Error {
  constructor(public code: ReportCode) {
    super(code);
    this.name = "ReportError";
  }
}

export type ReportStatus = "pending" | "approved" | "rejected" | "needs_correction";
export type AbsenceReason = "reserve_duty" | "illness" | "security_situation" | "other";
const ABSENCE: AbsenceReason[] = ["reserve_duty", "illness", "security_situation", "other"];

const todayIL = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const timeOk = (s?: string | null) => !s || /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export type SubmitInput = {
  type: "volunteering" | "absence";
  placementId?: string | null;
  volunteerDate: string;
  startTime?: string | null;
  endTime?: string | null;
  reportedHours: number;
  studentNotes?: string | null;
  absenceReason?: AbsenceReason | null;
};

/** שדות הדיווח המשותפים לבדיקה (הגשה ותיקון) */
async function validate(tx: Db | Tx, actor: SessionUser, input: SubmitInput, excludeReportId?: string) {
  if (!isDate(input.volunteerDate)) throw new ReportError("bad_date");
  if (input.volunteerDate > todayIL()) throw new ReportError("future_date");
  if (!timeOk(input.startTime) || !timeOk(input.endTime) || (input.startTime && input.endTime && input.endTime <= input.startTime)) throw new ReportError("bad_time");
  const hrs = round2(input.reportedHours);
  if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 24) throw new ReportError("bad_hours");
  if (input.type === "absence" && (!input.absenceReason || !ABSENCE.includes(input.absenceReason))) throw new ReportError("bad_reason");

  const [year] = await tx.select().from(academicYears).where(and(eq(academicYears.organizationId, actor.organizationId), eq(academicYears.isCurrent, true))).limit(1);
  if (!year) throw new ReportError("no_year");
  if (input.volunteerDate < String(year.startDate) || input.volunteerDate > String(year.endDate)) throw new ReportError("outside_year");

  let placement: { id: string; placeId: string } | null = null;
  if (input.type === "volunteering" || input.placementId) {
    const [p] = await tx.select({ id: placements.id, placeId: placements.placeId, studentId: placements.studentId, isActive: placements.isActive })
      .from(placements).where(and(eq(placements.id, input.placementId ?? ""), eq(placements.organizationId, actor.organizationId))).limit(1);
    // דיווח התנדבות רק על שיבוץ פעיל של הסטודנט עצמו
    if (!p || p.studentId !== actor.id || (input.type === "volunteering" && !p.isActive)) throw new ReportError("not_your_placement");
    placement = { id: p.id, placeId: p.placeId };
  }

  // תקרת שעות ליום (לפי המסלול), על כל הדיווחים הפעילים באותו יום
  const [cap] = await tx.select({ max: programs.maxHoursPerDay }).from(studentProfiles).leftJoin(programs, eq(programs.id, studentProfiles.trackId)).where(eq(studentProfiles.userId, actor.id));
  if (input.type === "volunteering") {
    const sameDay = await tx.select({ id: hourReports.id, h: hourReports.reportedHours, placementId: hourReports.placementId, type: hourReports.reportType })
      .from(hourReports).where(and(eq(hourReports.studentId, actor.id), eq(hourReports.volunteerDate, input.volunteerDate), eq(hourReports.reportType, "volunteering"), inArray(hourReports.status, ["pending", "approved", "needs_correction"])));
    const others = sameDay.filter((r) => r.id !== excludeReportId);
    if (placement && others.some((r) => r.placementId === placement!.id)) throw new ReportError("duplicate");
    const max = cap?.max !== null && cap?.max !== undefined ? Number(cap.max) : null;
    if (max !== null && round2(others.reduce((a, r) => a + Number(r.h), 0) + hrs) > max) throw new ReportError("day_over_max");
  }
  return { year, placement, hrs };
}

async function loadStudentRow(tx: Db | Tx, actor: SessionUser) {
  const [me] = await tx.select({ coordinatorId: users.coordinatorId, roles: users.roles, name: sql<string>`${users.firstName} || ' ' || ${users.lastName}` }).from(users).where(eq(users.id, actor.id));
  if (!me || !me.roles.includes("student")) throw new ReportError("not_a_student");
  return me;
}

export async function submitReport(db: Db, actor: SessionUser, input: SubmitInput): Promise<string> {
  const res = await db.transaction(async (tx) => {
    const me = await loadStudentRow(tx, actor);
    assertCan(actor, "create", "hour_report", { organizationId: actor.organizationId, ownerId: actor.id, coordinatorIds: me.coordinatorId ? [me.coordinatorId] : [] });
    // נעילת הסטודנט כדי ששתי הגשות מקבילות באותו יום לא יעקפו את בדיקת הכפילות
    await tx.execute(sql`SELECT 1 FROM users WHERE id = ${actor.id} FOR UPDATE`);
    const { year, placement, hrs } = await validate(tx, actor, input);
    const [row] = await tx.insert(hourReports).values({
      organizationId: actor.organizationId, studentId: actor.id, placementId: placement?.id ?? null, placeId: placement?.placeId ?? null,
      coordinatorId: me.coordinatorId, academicYearId: year.id, reportType: input.type, volunteerDate: input.volunteerDate,
      startTime: input.startTime || null, endTime: input.endTime || null, reportedHours: hrs, approvedHours: hrs,
      studentNotes: clean(input.studentNotes), absenceReason: input.type === "absence" ? input.absenceReason! : null,
    }).returning();
    await writeAudit(tx, { organizationId: actor.organizationId, actorId: actor.id }, { entity: "hour_report", entityId: row.id, action: "create" }, null, row);
    return { id: row.id, coordinatorId: me.coordinatorId, name: me.name };
  });
  await notifyUser(db, res.coordinatorId, "report.submitted", { student: res.name });
  return res.id;
}

/** הסטודנט מתקן דיווח שלו כל עוד לא אושר/נדחה. תיקון מחזיר ל-pending */
export async function resubmitReport(db: Db, actor: SessionUser, reportId: string, input: SubmitInput): Promise<void> {
  const res = await db.transaction(async (tx) => {
    const me = await loadStudentRow(tx, actor);
    await tx.execute(sql`SELECT 1 FROM users WHERE id = ${actor.id} FOR UPDATE`);
    const [old] = await tx.select().from(hourReports).where(and(eq(hourReports.id, reportId), eq(hourReports.organizationId, actor.organizationId))).for("update");
    if (!old) throw new NotFoundError();
    assertCan(actor, "update", "hour_report", { organizationId: actor.organizationId, ownerId: old.studentId, coordinatorIds: me.coordinatorId ? [me.coordinatorId] : [] });
    if (old.studentId !== actor.id) throw new NotFoundError();
    if (old.status !== "pending" && old.status !== "needs_correction") throw new ReportError("not_editable");
    if (old.reportType !== input.type) throw new ReportError("not_editable");
    const { placement, hrs } = await validate(tx, actor, input, old.id);
    const [row] = await tx.update(hourReports).set({
      placementId: placement?.id ?? null, placeId: placement?.placeId ?? null, coordinatorId: me.coordinatorId, volunteerDate: input.volunteerDate,
      startTime: input.startTime || null, endTime: input.endTime || null, reportedHours: hrs, approvedHours: hrs, studentNotes: clean(input.studentNotes),
      absenceReason: input.type === "absence" ? input.absenceReason! : null, status: "pending", submittedAt: new Date(),
    }).where(eq(hourReports.id, old.id)).returning();
    await writeAudit(tx, { organizationId: actor.organizationId, actorId: actor.id }, { entity: "hour_report", entityId: old.id, action: "resubmit" }, old, row);
    return { coordinatorId: me.coordinatorId, name: me.name };
  });
  await notifyUser(db, res.coordinatorId, "report.submitted", { student: res.name });
}

/* ───────────── קריאה ───────────── */

export type ReportRow = typeof hourReports.$inferSelect & { studentName: string; placeName: string | null; windowLabel: string | null };

const reportSelect = (db: Db) =>
  db.select({ r: hourReports, first: users.firstName, last: users.lastName, placeName: volunteerPlaces.name, windowLabel: placeTimeWindows.label, studentCoordinator: users.coordinatorId })
    .from(hourReports).innerJoin(users, eq(users.id, hourReports.studentId))
    .leftJoin(placements, eq(placements.id, hourReports.placementId)).leftJoin(volunteerPlaces, eq(volunteerPlaces.id, hourReports.placeId))
    .leftJoin(placeTimeWindows, eq(placeTimeWindows.id, placements.timeWindowId));

type Joined = Awaited<ReturnType<ReturnType<typeof reportSelect>["limit"]>>[number];
const shape = (x: Joined): ReportRow => ({ ...x.r, studentName: `${x.first} ${x.last}`, placeName: x.placeName, windowLabel: x.windowLabel });

export async function listMyReports(db: Db, actor: SessionUser): Promise<ReportRow[]> {
  assertCan(actor, "read", "hour_report", { organizationId: actor.organizationId, ownerId: actor.id });
  const rows = await reportSelect(db).where(and(eq(hourReports.studentId, actor.id), eq(hourReports.organizationId, actor.organizationId))).orderBy(desc(hourReports.volunteerDate), desc(hourReports.submittedAt)).limit(300);
  return rows.map(shape);
}

export async function getMyReport(db: Db, actor: SessionUser, id: string): Promise<ReportRow> {
  const [row] = await reportSelect(db).where(and(eq(hourReports.id, id), eq(hourReports.studentId, actor.id), eq(hourReports.organizationId, actor.organizationId))).limit(1);
  if (!row) throw new NotFoundError();
  return shape(row);
}

/** שיבוצים פעילים של הסטודנט עם ערכי ברירת מחדל לדיווח (מהחוזה) */
export async function reportablePlacements(db: Db, actor: SessionUser) {
  const rows = await db.select({ p: placements, placeName: volunteerPlaces.name, windowLabel: placeTimeWindows.label }).from(placements)
    .innerJoin(volunteerPlaces, eq(volunteerPlaces.id, placements.placeId)).innerJoin(placeTimeWindows, eq(placeTimeWindows.id, placements.timeWindowId))
    .where(and(eq(placements.studentId, actor.id), eq(placements.organizationId, actor.organizationId), eq(placements.isActive, true))).orderBy(volunteerPlaces.name);
  return rows.map((x) => {
    const perDay = x.p.assignedDays.length > 0 ? round2(Number(x.p.weeklyHours) / x.p.assignedDays.length) : Number(x.p.weeklyHours);
    const startEnd = /^(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})$/.exec(x.p.assignedHours ?? "");
    return {
      id: x.p.id, placeName: x.placeName, windowLabel: x.windowLabel,
      defaultHours: x.p.defaultReportHours !== null ? Number(x.p.defaultReportHours) : perDay,
      startTime: startEnd?.[1] ?? "", endTime: startEnd?.[2] ?? "",
    };
  });
}

/** תיבת הדואר של הרכז: דיווחים של הסטודנטים שהוא אחראי עליהם (מנהל: כולם) */
export async function listInbox(db: Db, actor: SessionUser, opts: { status?: ReportStatus; studentId?: string } = {}): Promise<ReportRow[]> {
  assertCan(actor, "read", "hour_report", { organizationId: actor.organizationId, coordinatorIds: [actor.id] });
  const conds = [eq(hourReports.organizationId, actor.organizationId)];
  if (opts.status) conds.push(eq(hourReports.status, opts.status));
  if (opts.studentId) conds.push(eq(hourReports.studentId, opts.studentId));
  const rows = await reportSelect(db).where(and(...conds)).orderBy(hourReports.submittedAt).limit(500);
  return rows.filter((x) => can(actor, "read", "hour_report", { organizationId: actor.organizationId, ownerId: x.r.studentId, coordinatorIds: x.studentCoordinator ? [x.studentCoordinator] : [] })).map(shape);
}

/* ───────────── החלטת הרכז ───────────── */

export type Decision =
  | { kind: "approve"; approvedHours?: number; notes?: string | null; countsTowardTarget?: boolean }
  | { kind: "reject" | "needs_correction"; notes: string }
  | { kind: "unapprove"; reason: string };

export async function decide(db: Db, actor: SessionUser, reportId: string, d: Decision): Promise<void> {
  const out = await db.transaction(async (tx) => {
    const [old] = await tx.select().from(hourReports).where(and(eq(hourReports.id, reportId), eq(hourReports.organizationId, actor.organizationId))).for("update");
    if (!old) throw new NotFoundError();
    const [st] = await tx.select({ coordinatorId: users.coordinatorId }).from(users).where(eq(users.id, old.studentId));
    const subject = { organizationId: actor.organizationId, ownerId: old.studentId, coordinatorIds: st?.coordinatorId ? [st.coordinatorId] : [] };
    if (!can(actor, "read", "hour_report", subject)) throw new NotFoundError();
    assertCan(actor, "approve", "hour_report", subject);

    let patch: Partial<typeof hourReports.$inferInsert>;
    let action: string;
    let reason: string | undefined;
    if (d.kind === "unapprove") {
      if (old.status !== "approved") throw new ReportError("bad_transition");
      if (!clean(d.reason)) throw new ReportError("reason_required");
      patch = { status: "pending", approvedAt: null, approvedBy: null };
      action = "unapprove";
      reason = d.reason.trim();
    } else {
      if (old.status !== "pending") throw new ReportError("bad_transition");
      if (d.kind === "approve") {
        const hrs = d.approvedHours === undefined ? Number(old.reportedHours) : round2(d.approvedHours);
        if (!Number.isFinite(hrs) || hrs < 0 || hrs > 24) throw new ReportError("bad_hours");
        patch = { status: "approved", approvedHours: hrs, coordinatorNotes: clean(d.notes), approvedAt: new Date(), approvedBy: actor.id };
        if (old.reportType === "absence" && d.countsTowardTarget !== undefined) patch.countsTowardTarget = d.countsTowardTarget;
        action = "approve";
      } else {
        if (!clean(d.notes)) throw new ReportError("reason_required");
        patch = { status: d.kind === "reject" ? "rejected" : "needs_correction", coordinatorNotes: d.notes.trim(), approvedAt: null, approvedBy: null };
        action = d.kind;
        reason = d.notes.trim();
      }
    }
    const [row] = await tx.update(hourReports).set(patch).where(eq(hourReports.id, old.id)).returning();
    await writeAudit(tx, { organizationId: actor.organizationId, actorId: actor.id }, { entity: "hour_report", entityId: old.id, action, reason }, old, row);
    return { studentId: old.studentId, status: row.status, notes: row.coordinatorNotes };
  });
  await notifyUser(db, out.studentId, `report.${out.status}`, { notes: out.notes ?? "" });
}

async function notifyUser(db: Db, userId: string | null, template: string, data: Record<string, unknown>) {
  if (!userId) return;
  const [u] = await db.select({ email: users.email, locale: users.locale, status: users.status }).from(users).where(eq(users.id, userId));
  if (!u || u.status !== "active") return;
  await notify({ channel: "email", to: u.email, template, data, locale: (u.locale as "he" | "en") ?? "he" });
}

/** התקדמות הסטודנט מול היעד (לדף הבית שלו) */
export async function myProgress(db: Db, actor: SessionUser) {
  const [r] = await db.execute<{ approved: string; pending: string }>(sql`
    SELECT COALESCE(SUM(approved_hours) FILTER (WHERE status = 'approved' AND (report_type = 'volunteering' OR counts_toward_target)), 0)::text AS approved,
           COALESCE(SUM(reported_hours) FILTER (WHERE status = 'pending'), 0)::text AS pending
    FROM hour_reports r JOIN academic_years y ON y.id = r.academic_year_id AND y.is_current
    WHERE r.student_id = ${actor.id} AND r.organization_id = ${actor.organizationId}`).then((x) => x.rows);
  return { approved: Number(r?.approved ?? 0), pending: Number(r?.pending ?? 0) };
}

