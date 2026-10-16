/**
 * דשבורד ודוחות (שלב 8). מנהל רואה הכל; רכז רק את הסטודנטים שלו; מראיין וסטודנט לא.
 * אף מספר לא נשמר: הכל מחושב מהשיבוצים והדיווחים. רק status = approved נספר,
 * והיעדרות נספרת רק אם counts_toward_target. ת"ז ופרטי בנק אינם בשום דוח.
 * ההגבלה לרכז נאכפת בתוך השאילתה (לא מסננים אחרי), כך שאי אפשר לקבל נתונים של אחרים בטעות.
 */
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { academicYears } from "@/lib/db/schema";
import { windowUsageRows } from "@/lib/db/queries/capacity";
import { assertCan, ForbiddenError, type SessionUser } from "@/lib/permissions";
import { round2, weeksRemaining } from "@/lib/services/capacity";
import { listFields, loadValuesMany } from "@/lib/services/custom-fields";
import { loadRules } from "@/lib/services/cron";

export const REPORT_KINDS = ["students", "places", "coordinators", "months", "milestones", "absences"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export type Cell = string | number | null;
export type Column = { key: string; type: "text" | "hours" | "percent" | "date" | "int" };
export type ReportTable = { kind: ReportKind; columns: Column[]; rows: Record<string, Cell>[]; yearName: string };
export type Filters = { month?: string; coordinatorId?: string };

const isMonth = (s?: string) => !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

/** מי רשאי ואיזה היקף. מחזיר את מזהה הרכז שמגביל את השאילתה (או null למנהל בלי סינון) */
function scopeOf(actor: SessionUser, f: Filters): { coordinatorId: string | null } {
  assertCan(actor, "export", "hour_report", { organizationId: actor.organizationId, coordinatorIds: [actor.id] });
  if (actor.roles.includes("manager")) return { coordinatorId: f.coordinatorId ?? null };
  if (!actor.roles.includes("coordinator")) throw new ForbiddenError();
  return { coordinatorId: actor.id }; // רכז: תמיד רק הסטודנטים שלו, בלי קשר לפרמטר
}

async function currentYear(db: Db, org: string) {
  const [y] = await db.select().from(academicYears).where(and(eq(academicYears.organizationId, org), eq(academicYears.isCurrent, true))).limit(1);
  return y ?? null;
}

const COUNTED: SQL = sql`(r.status = 'approved' AND (r.report_type = 'volunteering' OR r.counts_toward_target))`;
const monthCond = (m?: string): SQL => (isMonth(m) ? sql`AND to_char(r.volunteer_date, 'YYYY-MM') = ${m!}` : sql``);

export async function buildReport(db: Db, actor: SessionUser, kind: ReportKind, filters: Filters = {}): Promise<ReportTable> {
  const { coordinatorId } = scopeOf(actor, filters);
  const org = actor.organizationId;
  const year = await currentYear(db, org);
  const empty = (columns: Column[]): ReportTable => ({ kind, columns, rows: [], yearName: year?.name ?? "" });
  const studentScope: SQL = coordinatorId ? sql`AND u.coordinator_id = ${coordinatorId}` : sql``;
  const num = (v: unknown) => round2(Number(v ?? 0));

  if (kind === "students") {
    const cols: Column[] = [
      { key: "student", type: "text" }, { key: "coordinator", type: "text" }, { key: "track", type: "text" }, { key: "target", type: "hours" },
      { key: "approved", type: "hours" }, { key: "pending", type: "hours" }, { key: "remaining", type: "hours" }, { key: "progress", type: "percent" },
    ];
    if (!year) return empty(cols);
    const res = await db.execute<{ id: string; student: string; coordinator: string | null; track: string | null; target: string | null; approved: string; pending: string }>(sql`
      SELECT u.id, u.first_name || ' ' || u.last_name AS student, c.first_name || ' ' || c.last_name AS coordinator, p.name AS track,
             COALESCE(sp.target_hours_override, p.required_hours) AS target,
             COALESCE(SUM(r.approved_hours) FILTER (WHERE ${COUNTED}), 0) AS approved,
             COALESCE(SUM(r.reported_hours) FILTER (WHERE r.status = 'pending'), 0) AS pending
      FROM users u JOIN student_profiles sp ON sp.user_id = u.id
      LEFT JOIN programs p ON p.id = sp.track_id LEFT JOIN users c ON c.id = u.coordinator_id
      LEFT JOIN hour_reports r ON r.student_id = u.id AND r.academic_year_id = ${year.id} ${monthCond(filters.month)}
      WHERE u.organization_id = ${org} AND 'student' = ANY(u.roles) AND u.status = 'active' ${studentScope}
      GROUP BY u.id, c.id, p.id, sp.target_hours_override ORDER BY u.last_name, u.first_name`);
    // שדות מותאמים של סטודנט שהמשתמש רשאי לראות מגיעים גם לדוח ולייצוא
    const fields = await listFields(db, actor, "student");
    const rows: Record<string, Cell>[] = [];
    const allValues = await loadValuesMany(db, org, res.rows.map((r) => r.id), fields);
    for (const r of res.rows) {
      const target = r.target === null ? null : num(r.target), approved = num(r.approved);
      const row: Record<string, Cell> = {
        studentId: r.id, student: r.student, coordinator: r.coordinator, track: r.track, target, approved, pending: num(r.pending),
        remaining: target === null ? null : round2(Math.max(0, target - approved)), progress: target ? round2((approved / target) * 100) : null,
      };
      if (fields.length) {
        const vals = allValues.get(r.id)!;
        for (const f of fields) { const v = vals[f.id]; row[`cf:${f.labelHe}`] = Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "כן" : "לא") : (v as Cell); }
      }
      rows.push(row);
    }
    return { kind, yearName: year.name, rows, columns: [...cols, ...fields.map((f): Column => ({ key: `cf:${f.labelHe}`, type: "text" }))] };
  }

  if (kind === "places") {
    const cols: Column[] = [{ key: "place", type: "text" }, { key: "city", type: "text" }, { key: "requestedWeekly", type: "hours" }, { key: "allocatedWeekly", type: "hours" }, { key: "remainingWeekly", type: "hours" }, { key: "approvedYear", type: "hours" }];
    if (!year) return empty(cols);
    const usage = await windowUsageRows(db, org);
    const places = await db.execute<{ id: string; name: string; city: string | null; status: string; approved: string }>(sql`
      SELECT vp.id, vp.name, vp.city, vp.status,
             COALESCE((SELECT SUM(r.approved_hours) FROM hour_reports r JOIN users u ON u.id = r.student_id
                       WHERE r.place_id = vp.id AND r.academic_year_id = ${year.id} AND ${COUNTED} ${monthCond(filters.month)} ${studentScope}), 0) AS approved
      FROM volunteer_places vp WHERE vp.organization_id = ${org} ORDER BY vp.name`);
    const by = new Map<string, { req: number; alloc: number; rem: number }>();
    for (const u of usage) { const c = by.get(u.placeId) ?? { req: 0, alloc: 0, rem: 0 }; c.req += u.requestedHours; c.alloc += u.allocatedHours; c.rem += u.remainingHours; by.set(u.placeId, c); }
    return { kind, yearName: year.name, columns: cols, rows: places.rows.filter((p) => p.status === "active" || num(p.approved) > 0 || (by.get(p.id)?.alloc ?? 0) > 0).map((p) => {
      // מקום שהושהה/נסגר נשאר בדוח כל עוד יש בו שיבוצים או שעות מאושרות השנה
      const c = by.get(p.id) ?? { req: 0, alloc: 0, rem: 0 };
      return { place: p.name, city: p.city, requestedWeekly: round2(c.req), allocatedWeekly: round2(c.alloc), remainingWeekly: round2(c.rem), approvedYear: num(p.approved) };
    }) };
  }

  if (kind === "coordinators") {
    const cols: Column[] = [{ key: "coordinator", type: "text" }, { key: "students", type: "int" }, { key: "pendingReports", type: "int" }, { key: "oldestPendingDays", type: "int" }, { key: "approvedYear", type: "hours" }];
    if (!year) return empty(cols);
    if (!actor.roles.includes("manager")) throw new ForbiddenError(); // השוואה בין רכזים: למנהל בלבד
    const res = await db.execute<{ name: string; students: number; pending: number; oldest: number | null; approved: string }>(sql`
      SELECT c.first_name || ' ' || c.last_name AS name,
             (SELECT count(*)::int FROM users s WHERE s.coordinator_id = c.id AND s.status = 'active') AS students,
             (SELECT count(*)::int FROM hour_reports r JOIN users s ON s.id = r.student_id WHERE s.coordinator_id = c.id AND r.status = 'pending') AS pending,
             (SELECT floor(extract(epoch FROM (now() - min(r.submitted_at))) / 86400)::int FROM hour_reports r JOIN users s ON s.id = r.student_id WHERE s.coordinator_id = c.id AND r.status = 'pending') AS oldest,
             COALESCE((SELECT SUM(r.approved_hours) FROM hour_reports r JOIN users s ON s.id = r.student_id WHERE s.coordinator_id = c.id AND r.academic_year_id = ${year.id} AND ${COUNTED} ${monthCond(filters.month)}), 0) AS approved
      FROM users c WHERE c.organization_id = ${org} AND 'coordinator' = ANY(c.roles) AND c.status = 'active' ORDER BY c.first_name, c.last_name`);
    return { kind, yearName: year.name, columns: cols, rows: res.rows.map((r) => ({ coordinator: r.name, students: r.students, pendingReports: r.pending, oldestPendingDays: r.oldest, approvedYear: num(r.approved) })) };
  }

  if (kind === "months") {
    const cols: Column[] = [{ key: "month", type: "text" }, { key: "reports", type: "int" }, { key: "approvedHours", type: "hours" }];
    if (!year) return empty(cols);
    const res = await db.execute<{ month: string; n: number; h: string }>(sql`
      SELECT to_char(r.volunteer_date, 'YYYY-MM') AS month, count(*)::int AS n, SUM(r.approved_hours) AS h
      FROM hour_reports r JOIN users u ON u.id = r.student_id
      WHERE r.organization_id = ${org} AND r.academic_year_id = ${year.id} AND ${COUNTED} ${studentScope}
      GROUP BY 1 ORDER BY 1`);
    return { kind, yearName: year.name, columns: cols, rows: res.rows.map((r) => ({ month: r.month, reports: r.n, approvedHours: num(r.h) })) };
  }

  if (kind === "milestones") {
    const cols: Column[] = [{ key: "student", type: "text" }, { key: "coordinator", type: "text" }, { key: "track", type: "text" }, { key: "approved", type: "hours" }, { key: "reachedMilestone", type: "text" }, { key: "nextMilestone", type: "text" }, { key: "toNext", type: "hours" }];
    if (!year) return empty(cols);
    const res = await db.execute<{ student: string; coordinator: string | null; track: string | null; milestones: { hours: number; label: string }[] | null; approved: string }>(sql`
      SELECT u.first_name || ' ' || u.last_name AS student, c.first_name || ' ' || c.last_name AS coordinator, p.name AS track, p.milestones,
             COALESCE(SUM(r.approved_hours) FILTER (WHERE ${COUNTED}), 0) AS approved
      FROM users u JOIN student_profiles sp ON sp.user_id = u.id JOIN programs p ON p.id = sp.track_id LEFT JOIN users c ON c.id = u.coordinator_id
      LEFT JOIN hour_reports r ON r.student_id = u.id AND r.academic_year_id = ${year.id}
      WHERE u.organization_id = ${org} AND 'student' = ANY(u.roles) AND u.status = 'active' ${studentScope}
      GROUP BY u.id, c.id, p.id ORDER BY u.last_name, u.first_name`);
    return { kind, yearName: year.name, columns: cols, rows: res.rows.map((r) => {
      const ms = [...(r.milestones ?? [])].sort((a, b) => a.hours - b.hours), approved = num(r.approved);
      const reached = ms.filter((m) => approved >= m.hours).pop(), next = ms.find((m) => approved < m.hours);
      return { student: r.student, coordinator: r.coordinator, track: r.track, approved, reachedMilestone: reached ? `${reached.label} (${reached.hours})` : null, nextMilestone: next ? `${next.label} (${next.hours})` : null, toNext: next ? round2(next.hours - approved) : null };
    }) };
  }

  // absences
  const cols: Column[] = [{ key: "student", type: "text" }, { key: "coordinator", type: "text" }, { key: "date", type: "date" }, { key: "reason", type: "text" }, { key: "hours", type: "hours" }, { key: "status", type: "text" }, { key: "counts", type: "text" }];
  if (!year) return empty(cols);
  const res = await db.execute<{ student: string; coordinator: string | null; date: string; reason: string | null; hours: string; status: string; counts: boolean }>(sql`
    SELECT u.first_name || ' ' || u.last_name AS student, c.first_name || ' ' || c.last_name AS coordinator, to_char(r.volunteer_date, 'YYYY-MM-DD') AS date,
           r.absence_reason AS reason, r.reported_hours AS hours, r.status, r.counts_toward_target AS counts
    FROM hour_reports r JOIN users u ON u.id = r.student_id LEFT JOIN users c ON c.id = u.coordinator_id
    WHERE r.organization_id = ${org} AND r.academic_year_id = ${year.id} AND r.report_type = 'absence' ${monthCond(filters.month)} ${studentScope}
    ORDER BY r.volunteer_date DESC, u.last_name`);
  return { kind, yearName: year.name, columns: cols, rows: res.rows.map((r) => ({ student: r.student, coordinator: r.coordinator, date: r.date, reason: r.reason, hours: num(r.hours), status: r.status, counts: r.counts ? "yes" : "no" })) };
}

/** ספירות ללוח הבקרה (למנהל: כל הארגון; לרכז: הסטודנטים שלו) */
export type DashboardData = Awaited<ReturnType<typeof dashboard>>;

export async function dashboard(db: Db, actor: SessionUser) {
  const { coordinatorId } = scopeOf(actor, {});
  const org = actor.organizationId;
  const isManager = actor.roles.includes("manager");
  const year = await currentYear(db, org);
  const studentScope: SQL = coordinatorId ? sql`AND u.coordinator_id = ${coordinatorId}` : sql``;
  const escDays = (await loadRules(db, org)).report_escalation.firstAfterDays;
  const yearCond: SQL = year ? sql`AND r.academic_year_id = ${year.id}` : sql`AND false`;
  const [c] = (await db.execute<{ active: number; new_month: number; awaiting: number; awaiting_week: number; stale: number; pending: number; hours_year: string; hours_30d: string }>(sql`
    SELECT
      (SELECT count(*)::int FROM users u WHERE u.organization_id = ${org} AND 'student' = ANY(u.roles) AND u.status = 'active' ${studentScope}) AS active,
      (SELECT count(*)::int FROM users u WHERE u.organization_id = ${org} AND 'student' = ANY(u.roles) AND u.status = 'active' AND u.created_at >= date_trunc('month', now()) ${studentScope}) AS new_month,
      (SELECT count(*)::int FROM users u JOIN student_profiles sp ON sp.user_id = u.id WHERE u.organization_id = ${org} AND 'student' = ANY(u.roles) AND u.status = 'active' AND sp.profile_completed_at IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM interviews i WHERE i.student_id = u.id AND i.status = 'finalized' AND i.kind = 'interview') ${studentScope}) AS awaiting,
      (SELECT count(*)::int FROM users u JOIN student_profiles sp ON sp.user_id = u.id WHERE u.organization_id = ${org} AND 'student' = ANY(u.roles) AND u.status = 'active' AND sp.profile_completed_at >= now() - interval '7 days'
         AND NOT EXISTS (SELECT 1 FROM interviews i WHERE i.student_id = u.id AND i.status = 'finalized' AND i.kind = 'interview') ${studentScope}) AS awaiting_week,
      (SELECT count(*)::int FROM hour_reports r JOIN users u ON u.id = r.student_id WHERE r.organization_id = ${org} AND r.status = 'pending'
         AND r.submitted_at <= now() - make_interval(days => ${escDays}) ${studentScope}) AS stale,
      (SELECT count(*)::int FROM hour_reports r JOIN users u ON u.id = r.student_id WHERE r.organization_id = ${org} AND r.status = 'pending' ${studentScope}) AS pending,
      (SELECT COALESCE(SUM(r.approved_hours), 0) FROM hour_reports r JOIN users u ON u.id = r.student_id WHERE r.organization_id = ${org} AND ${COUNTED} ${yearCond} ${studentScope}) AS hours_year,
      (SELECT COALESCE(SUM(r.approved_hours), 0) FROM hour_reports r JOIN users u ON u.id = r.student_id WHERE r.organization_id = ${org} AND ${COUNTED} ${yearCond} AND r.volunteer_date >= (current_date - 30) ${studentScope}) AS hours_30d`)).rows;
  const usage = await windowUsageRows(db, org);
  const slots = await db.execute<{ total: string; used: string }>(sql`
    SELECT COALESCE(SUM(w.slots), 0) AS total,
           COALESCE((SELECT SUM(p.slots) FROM placements p JOIN place_time_windows w2 ON w2.id = p.time_window_id WHERE p.organization_id = ${org} AND p.is_active AND w2.is_active), 0) AS used
    FROM place_time_windows w WHERE w.organization_id = ${org} AND w.is_active`);
  const [by] = slots.rows;
  const totalSlots = round2(Number(by?.total ?? 0)), usedSlots = round2(Number(by?.used ?? 0));

  // הדיווחים שמחכים הכי הרבה (בהיקף של המשתמש)
  const oldest = await db.execute<{ id: string; student_id: string; student: string; place: string | null; window_label: string | null; coordinator: string | null; report_type: string; hours: string; days: number }>(sql`
    SELECT r.id, u.id AS student_id, u.first_name || ' ' || u.last_name AS student, vp.name AS place, w.label AS window_label,
           c.first_name || ' ' || c.last_name AS coordinator, r.report_type, r.reported_hours AS hours,
           floor(extract(epoch FROM (now() - r.submitted_at)) / 86400)::int AS days
    FROM hour_reports r JOIN users u ON u.id = r.student_id
      LEFT JOIN volunteer_places vp ON vp.id = r.place_id
      LEFT JOIN placements p ON p.id = r.placement_id LEFT JOIN place_time_windows w ON w.id = p.time_window_id
      LEFT JOIN users c ON c.id = u.coordinator_id
    WHERE r.organization_id = ${org} AND r.status = 'pending' ${studentScope}
    ORDER BY r.submitted_at ASC LIMIT 5`);

  // עומס רכזים: למנהל בלבד (השוואה בין רכזים)
  const coordinators = isManager ? (await db.execute<{ id: string; name: string; students: number; pending: number; oldest: number | null }>(sql`
    SELECT c.id, c.first_name || ' ' || c.last_name AS name,
           (SELECT count(*)::int FROM users s WHERE s.coordinator_id = c.id AND s.status = 'active' AND 'student' = ANY(s.roles)) AS students,
           (SELECT count(*)::int FROM hour_reports r JOIN users s ON s.id = r.student_id WHERE s.coordinator_id = c.id AND r.status = 'pending') AS pending,
           (SELECT floor(extract(epoch FROM (now() - min(r.submitted_at))) / 86400)::int FROM hour_reports r JOIN users s ON s.id = r.student_id WHERE s.coordinator_id = c.id AND r.status = 'pending') AS oldest
    FROM users c WHERE c.organization_id = ${org} AND 'coordinator' = ANY(c.roles) AND c.status = 'active'
    ORDER BY oldest DESC NULLS LAST, pending DESC, c.first_name`)).rows : [];

  // תפוסה לפי מקום: תקנים משובצים מתוך תקנים מבוקשים, מחושב מהשיבוצים הפעילים
  const placeNames = await db.execute<{ id: string; name: string; status: string }>(sql`SELECT id, name, status FROM volunteer_places WHERE organization_id = ${org} AND status = 'active' ORDER BY name`);
  const occ = new Map<string, { slots: number; allocated: number }>();
  for (const u of usage) { const c0 = occ.get(u.placeId) ?? { slots: 0, allocated: 0 }; occ.set(u.placeId, { slots: round2(c0.slots + u.allocatedSlots + u.remainingSlots), allocated: round2(c0.allocated + u.allocatedSlots) }); }
  const placeOccupancy = placeNames.rows.map((p) => { const o = occ.get(p.id) ?? { slots: 0, allocated: 0 }; return { placeId: p.id, name: p.name, slots: o.slots, allocated: o.allocated, percent: o.slots ? Math.round((o.allocated / o.slots) * 100) : 0 }; })
    .filter((p) => p.slots > 0).sort((a, b) => b.slots - a.slots).slice(0, 8);

  const months = await buildReport(db, actor, "months");
  const places = await buildReport(db, actor, "places");
  const milestones = year ? await buildReport(db, actor, "milestones") : null;
  const absences = year ? await buildReport(db, actor, "absences") : null;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
  const num = (v: unknown) => round2(Number(v ?? 0));
  return {
    yearName: year?.name ?? "", activeStudents: c.active, newStudentsThisMonth: c.new_month, awaitingInterview: c.awaiting, awaitingThisWeek: c.awaiting_week,
    staleReports: c.stale, pendingReports: c.pending, escalationDays: escDays,
    hoursYear: num(c.hours_year), hoursLast30Days: num(c.hours_30d),
    slots: { total: totalSlots, used: usedSlots, percent: totalSlots ? round2((usedSlots / totalSlots) * 100) : 0, windows: usage.length },
    byMonth: months.rows.map((r) => ({ label: String(r.month), value: Number(r.approvedHours) })),
    byPlace: places.rows.filter((r) => Number(r.approvedYear) > 0).map((r) => ({ label: String(r.place), value: Number(r.approvedYear) })).sort((a, b) => b.value - a.value).slice(0, 8),
    oldestPending: oldest.rows.map((r) => ({ id: r.id, studentId: r.student_id, studentName: r.student, placeName: r.place, windowLabel: r.window_label, coordinator: r.coordinator, reportType: r.report_type as "volunteering" | "absence", hours: num(r.hours), days: r.days })),
    coordinators: coordinators.map((r) => ({ id: r.id, name: r.name, students: r.students, pending: r.pending, oldestDays: r.oldest })),
    placeOccupancy,
    year: {
      weeksRemaining: year ? weeksRemaining(today, String(year.endDate)) : 0,
      milestone1: milestones && milestones.rows.length > 0 ? { reached: milestones.rows.filter((r) => r.reachedMilestone !== null).length, total: milestones.rows.length } : null,
      approvedAbsences: absences ? absences.rows.filter((r) => r.status === "approved").length : 0,
      activePlaces: placeNames.rows.length,
    },
  };
}

/** תעודת שעות לסטודנט: שעות מאושרות בשנה הנוכחית, בלי פרטים רגישים */
export async function hoursCertificate(db: Db, actor: SessionUser, studentId: string) {
  const own = actor.id === studentId;
  if (own) assertCan(actor, "read", "hour_report", { organizationId: actor.organizationId, ownerId: studentId });
  else {
    const scope = scopeOf(actor, {});
    const [s] = await db.execute<{ coordinator_id: string | null }>(sql`SELECT coordinator_id FROM users WHERE id = ${studentId} AND organization_id = ${actor.organizationId}`).then((r) => r.rows);
    if (!s || (scope.coordinatorId && s.coordinator_id !== scope.coordinatorId)) throw new ForbiddenError();
  }
  const year = await currentYear(db, actor.organizationId);
  if (!year) return null;
  const [st] = (await db.execute<{ name: string; track: string | null; target: string | null }>(sql`
    SELECT u.first_name || ' ' || u.last_name AS name, p.name AS track, COALESCE(sp.target_hours_override, p.required_hours) AS target
    FROM users u JOIN student_profiles sp ON sp.user_id = u.id LEFT JOIN programs p ON p.id = sp.track_id
    WHERE u.id = ${studentId} AND u.organization_id = ${actor.organizationId}`)).rows;
  if (!st) return null;
  const rows = await db.execute<{ date: string; place: string | null; type: string; hours: string }>(sql`
    SELECT to_char(r.volunteer_date, 'YYYY-MM-DD') AS date, vp.name AS place, r.report_type AS type, r.approved_hours AS hours
    FROM hour_reports r LEFT JOIN volunteer_places vp ON vp.id = r.place_id
    WHERE r.student_id = ${studentId} AND r.academic_year_id = ${year.id} AND ${COUNTED} ORDER BY r.volunteer_date`);
  const items = rows.rows.map((r) => ({ date: r.date, place: r.place, type: r.type, hours: round2(Number(r.hours)) }));
  return { student: st.name, track: st.track, target: st.target === null ? null : round2(Number(st.target)), yearName: year.name, items, total: round2(items.reduce((a, x) => a + x.hours, 0)), issuedAt: new Date() };
}

