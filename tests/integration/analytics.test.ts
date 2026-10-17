import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { closeDb, db } from "@/lib/db";
import { customFields, customFieldValues, hourReports, placements, users } from "@/lib/db/schema";
import { deleteOrganization, seedDemo } from "@/lib/db/seed";
import { ForbiddenError, type Role, type SessionUser } from "@/lib/permissions";
import { buildReport, dashboard, hoursCertificate } from "@/lib/services/analytics";
import { decide, submitReport } from "@/lib/services/reports";
import { reportToXlsx } from "@/lib/export/xlsx";

type Seed = Awaited<ReturnType<typeof seedDemo>>;
let s: Seed;
const act = (u: { id: string }, org: string, roles: Role[]): SessionUser => ({ id: u.id, organizationId: org, roles });
let manager: SessionUser, c1: SessionUser, c2: SessionUser, interviewer: SessionUser, st0: SessionUser, st2: SessionUser;

beforeAll(async () => {
  s = await seedDemo(db(), { orgName: `אנליטיקה ${Date.now()}` });
  manager = act(s.manager, s.organizationId, ["manager"]);
  c1 = act(s.coordinators[0], s.organizationId, ["coordinator"]);
  c2 = act(s.coordinators[1], s.organizationId, ["coordinator"]);
  interviewer = act(s.interviewer, s.organizationId, ["interviewer"]);
  st0 = act(s.students[0], s.organizationId, ["student"]);
  st2 = act(s.students[2], s.organizationId, ["student"]);
});
afterAll(async () => {
  if (s) await deleteOrganization(db(), s.organizationId);
  await closeDb();
});

/** סכום מאושר לסטודנט, מחושב ישירות מהמסד בלי להשתמש בשירות הנבדק */
async function approvedOf(studentId: string) {
  const rows = await db().select().from(hourReports).where(eq(hourReports.studentId, studentId));
  return rows.filter((r) => r.status === "approved" && (r.reportType === "volunteering" || r.countsTowardTarget)).reduce((a, r) => a + Number(r.approvedHours), 0);
}

describe("דוחות: הרשאות והיקף", () => {
  it("מראיין וסטודנט נחסמים; רכז לא רואה דוח רכזים", async () => {
    for (const who of [interviewer, st0]) {
      await expect(buildReport(db(), who, "students")).rejects.toBeInstanceOf(ForbiddenError);
      await expect(dashboard(db(), who)).rejects.toBeInstanceOf(ForbiddenError);
    }
    await expect(buildReport(db(), c1, "coordinators")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("רכז רואה רק את הסטודנטים שלו, גם אם מבקש רכז אחר בפרמטר", async () => {
    const mine = await buildReport(db(), c1, "students", { coordinatorId: s.coordinators[1].id });
    const names = mine.rows.map((r) => r.student);
    expect(names.length).toBe(2);
    expect(mine.rows.every((r) => r.coordinator === `${s.coordinators[0].firstName} ${s.coordinators[0].lastName}`)).toBe(true);
    const all = await buildReport(db(), manager, "students");
    expect(all.rows.length).toBeGreaterThan(names.length);
    expect((await buildReport(db(), manager, "students", { coordinatorId: s.coordinators[1].id })).rows.length).toBe(2);
  });

  it("ת\"ז ובנק לא מופיעים באף דוח", async () => {
    for (const kind of ["students", "places", "coordinators", "months", "milestones", "absences"] as const) {
      const t = await buildReport(db(), manager, kind);
      const dump = JSON.stringify(t);
      expect(dump).not.toMatch(/national|nationalId|bank|iban|account/i);
    }
  });
});

describe("דוחות: המספרים מול המסד", () => {
  it("לפי סטודנט: מאושר = סכום approved בלבד (ממתין ונדחה לא נספרים)", async () => {
    const t = await buildReport(db(), manager, "students");
    for (const stu of s.students) {
      const row = t.rows.find((r) => r.studentId === stu.id)!;
      expect(row.approved).toBeCloseTo(await approvedOf(stu.id), 2);
    }
    const first = t.rows.find((r) => r.studentId === s.students[0].id)!;
    expect(first.target).toBe(140);
    expect(first.remaining).toBeCloseTo(140 - Number(first.approved), 2);
  });

  it("היעדרות נספרת רק עם counts_toward_target", async () => {
    // ה-seed אינו כולל היעדרות, אז יוצרים אחת ומאשרים אותה דרך השירות
    const id = await submitReport(db(), st2, { type: "absence", volunteerDate: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), reportedHours: 4, absenceReason: "reserve_duty" });
    await decide(db(), manager, id, { kind: "approve", countsTowardTarget: true });
    const approvedFor = async () => (await buildReport(db(), manager, "students")).rows.find((x) => x.studentId === st2.id)!.approved as number;
    const counted = await approvedFor();
    await db().update(hourReports).set({ countsTowardTarget: false }).where(eq(hourReports.id, id));
    const notCounted = await approvedFor();
    expect(counted - notCounted).toBeCloseTo(4, 2);
    expect(notCounted).toBeCloseTo(await approvedOf(st2.id), 2);
  });

  it("לפי חודש: סכום החודשים = סך המאושר בארגון", async () => {
    const months = await buildReport(db(), manager, "months");
    const total = months.rows.reduce((a, r) => a + Number(r.approvedHours), 0);
    let expected = 0;
    for (const stu of s.students) expected += await approvedOf(stu.id);
    expect(total).toBeCloseTo(expected, 2);
    // סינון חודש בדוח הסטודנטים: סכום שורות החודש הזה = שורת החודש
    const m = String(months.rows[0].month);
    const filtered = await buildReport(db(), manager, "students", { month: m });
    expect(filtered.rows.reduce((a, r) => a + Number(r.approved), 0)).toBeCloseTo(Number(months.rows[0].approvedHours), 2);
  });

  it("רכז: סיכום חודשים כולל רק את הסטודנטים שלו", async () => {
    const mine = await buildReport(db(), c1, "months");
    let expected = 0;
    for (const stu of [s.students[0], s.students[1]]) expected += await approvedOf(stu.id);
    expect(mine.rows.reduce((a, r) => a + Number(r.approvedHours), 0)).toBeCloseTo(expected, 2);
  });

  it("לפי מקום: משובץ ומבוקש מחושבים משיבוצים פעילים", async () => {
    const t = await buildReport(db(), manager, "places");
    const active = await db().select().from(placements).where(and(eq(placements.organizationId, s.organizationId), eq(placements.isActive, true)));
    expect(t.rows.reduce((a, r) => a + Number(r.allocatedWeekly), 0)).toBeCloseTo(active.reduce((a, p) => a + Number(p.weeklyHours), 0), 2);
    for (const r of t.rows) expect(Number(r.requestedWeekly) - Number(r.allocatedWeekly)).toBeCloseTo(Number(r.remainingWeekly), 2);
  });

  it("פעימות: הפעימה שהושגה והבאה לפי השעות המאושרות", async () => {
    await db().execute(sql`UPDATE hour_reports SET status = 'approved', approved_hours = 50 WHERE id = (SELECT id FROM hour_reports WHERE student_id = ${st0.id} AND status = 'pending' LIMIT 1)`);
    const approved = await approvedOf(st0.id);
    const row = (await buildReport(db(), manager, "milestones")).rows.find((r) => r.student === `${s.students[0].firstName} ${s.students[0].lastName}`)!;
    expect(row.approved).toBeCloseTo(approved, 2);
    const reached = [45, 90, 140].filter((h) => approved >= h).pop();
    if (reached) expect(String(row.reachedMilestone)).toContain(String(reached));
    else expect(row.reachedMilestone).toBeNull();
    const next = [45, 90, 140].find((h) => approved < h)!;
    expect(row.toNext).toBeCloseTo(next - approved, 2);
  });

  it("לוח בקרה: הספירות תואמות את המסד", async () => {
    const d = await dashboard(db(), manager);
    expect(d.activeStudents).toBe(6);
    const pending = (await db().select().from(hourReports).where(and(eq(hourReports.organizationId, s.organizationId), eq(hourReports.status, "pending")))).length;
    expect(d.pendingReports).toBe(pending);
    expect(d.slots.used).toBeLessThanOrEqual(d.slots.total);
    const dc1 = await dashboard(db(), c1);
    expect(dc1.activeStudents).toBe(2);
  });

  it("לוח בקרה (מורחב): שעות השנה, דיווחים ותיקים, עומס רכזים ותפוסה לפי מקום – בהיקף הנכון", async () => {
    const d = await dashboard(db(), manager);
    // שעות השנה = סכום המאושר של כל הסטודנטים, מחושב ישירות מהמסד
    let total = 0; for (const st of s.students) total += await approvedOf(st.id);
    expect(d.hoursYear).toBeCloseTo(total, 2);
    expect(d.hoursLast30Days).toBeLessThanOrEqual(d.hoursYear);
    // הדיווחים הוותיקים: ממתינים בלבד, ממוינים מהישן לחדש, עד 5
    expect(d.oldestPending.length).toBeLessThanOrEqual(5);
    expect(d.oldestPending.length).toBe(Math.min(5, d.pendingReports));
    for (let i = 1; i < d.oldestPending.length; i++) expect(d.oldestPending[i - 1].days).toBeGreaterThanOrEqual(d.oldestPending[i].days);
    // עומס רכזים: כל הרכזים הפעילים, סכום הסטודנטים = הסטודנטים המשויכים
    expect(d.coordinators.map((c) => c.id).sort()).toEqual(s.coordinators.map((c) => c.id).sort());
    expect(d.coordinators.reduce((a, c) => a + c.pending, 0)).toBeLessThanOrEqual(d.pendingReports);
    // תפוסה: משובץ ≤ תקנים, ואחוז בין 0 ל-100 (או יותר רק בחריגה מאושרת)
    for (const p of d.placeOccupancy) { expect(p.allocated).toBeLessThanOrEqual(p.slots + 0.001); expect(p.percent).toBeGreaterThanOrEqual(0); }
    expect(d.year.weeksRemaining).toBeGreaterThanOrEqual(0);
    expect(d.year.activePlaces).toBeGreaterThan(0);
    // רכז: בלי עומס רכזים, והדיווחים הוותיקים רק של הסטודנטים שלו
    const dc1 = await dashboard(db(), c1);
    expect(dc1.coordinators).toEqual([]);
    const mine = new Set(s.students.filter((_, i) => i < 2).map((x) => x.id));
    expect(dc1.oldestPending.every((r) => mine.has(r.studentId))).toBe(true);
    expect(dc1.hoursYear).toBeLessThanOrEqual(d.hoursYear);
  });
});

describe("לוח בקרה: ערכים מדויקים (מחושבים ישירות מהמסד)", () => {
  const dayMs = 86_400_000;
  const counted = (r: typeof hourReports.$inferSelect) => r.status === "approved" && (r.reportType === "volunteering" || r.countsTowardTarget);
  const allReports = () => db().select().from(hourReports).where(eq(hourReports.organizationId, s.organizationId));

  it("דיווחים תקועים, שעות 30 יום וממתינים: ערך מדויק, למנהל ולרכז", async () => {
    const rows = await allReports();
    const pending = rows.filter((r) => r.status === "pending");
    const stale = pending.filter((r) => r.submittedAt.getTime() <= Date.now() - 7 * dayMs); // כלל ההסלמה ברירת מחדל: 7 ימים
    const cutoff = new Date(Date.now() - 30 * dayMs).toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
    const last30 = rows.filter((r) => counted(r) && String(r.volunteerDate) >= cutoff).reduce((a, r) => a + Number(r.approvedHours), 0);
    const d = await dashboard(db(), manager);
    expect(d.escalationDays).toBe(7);
    expect(d.staleReports).toBe(stale.length);
    expect(d.pendingReports).toBe(pending.length);
    expect(d.hoursLast30Days).toBeCloseTo(last30, 2);
    // רכז: רק הסטודנטים שלו (מזהים מהמסד, לא מההנחה "שניים ראשונים")
    const mine = new Set((await db().select({ id: users.id }).from(users).where(eq(users.coordinatorId, c1.id))).map((u) => u.id));
    const dc = await dashboard(db(), c1);
    expect(dc.pendingReports).toBe(pending.filter((r) => mine.has(r.studentId)).length);
    expect(dc.staleReports).toBe(stale.filter((r) => mine.has(r.studentId)).length);
    expect(dc.hoursYear).toBeCloseTo(rows.filter((r) => counted(r) && mine.has(r.studentId)).reduce((a, r) => a + Number(r.approvedHours), 0), 2);
  });

  it("סטודנטים חדשים החודש: סטודנט שנוצר לפני חודשיים לא נספר", async () => {
    const before = await dashboard(db(), manager);
    expect(before.newStudentsThisMonth).toBe(before.activeStudents); // כולם נוצרו עכשיו
    await db().update(users).set({ createdAt: new Date(Date.now() - 62 * dayMs) }).where(eq(users.id, s.students[5].id));
    const after = await dashboard(db(), manager);
    expect(after.newStudentsThisMonth).toBe(before.newStudentsThisMonth - 1);
    expect(after.activeStudents).toBe(before.activeStudents);
  });

  it("תפוסה לפי מקום: תקנים ומשובץ תואמים לחלונות הפעילים במסד", async () => {
    const d = await dashboard(db(), manager);
    const raw = (await db().execute<{ place_id: string; slots: string; allocated: string }>(sql`
      SELECT w.place_id, SUM(w.slots) AS slots,
             COALESCE(SUM((SELECT SUM(p.slots) FROM placements p WHERE p.time_window_id = w.id AND p.is_active)), 0) AS allocated
      FROM place_time_windows w WHERE w.organization_id = ${s.organizationId} AND w.is_active GROUP BY w.place_id`)).rows;
    for (const p of d.placeOccupancy) {
      const r = raw.find((x) => x.place_id === p.placeId)!;
      expect(p.slots).toBeCloseTo(Number(r.slots), 2);
      expect(p.allocated).toBeCloseTo(Number(r.allocated), 2);
    }
    expect(d.slots.total).toBeCloseTo(raw.reduce((a, r) => a + Number(r.slots), 0), 2);
    expect(d.slots.used).toBeCloseTo(raw.reduce((a, r) => a + Number(r.allocated), 0), 2);
  });
});

describe("ייצוא ותעודה", () => {
  it("Excel: גיליון מימין לשמאל, כותרות, מספרים כמספרים, ושדה מותאם מגיע לייצוא לפי הרשאה", async () => {
    const [f] = await db().insert(customFields).values({ organizationId: s.organizationId, entity: "student", key: "shirt", labelHe: "מידת חולצה", type: "text", visibleToRoles: ["manager", "coordinator"], editableByRoles: ["manager"] }).returning();
    await db().insert(customFieldValues).values({ organizationId: s.organizationId, fieldId: f.id, entityId: s.students[0].id, value: "M" });
    const table = await buildReport(db(), c1, "students");
    expect(table.columns.some((c) => c.key === "cf:מידת חולצה")).toBe(true);
    const buf = await reportToXlsx(table, { title: "לפי סטודנט", header: (k) => (k.startsWith("cf:") ? k.slice(3) : k), cell: (_k, v) => v });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.views[0]).toMatchObject({ rightToLeft: true });
    expect(ws.getRow(1).values).toContain("מידת חולצה");
    const approvedCol = table.columns.findIndex((c) => c.key === "approved") + 1;
    expect(typeof ws.getRow(2).getCell(approvedCol).value).toBe("number");
    // שדה שרק מנהל רואה לא מגיע לרכז, אבל מגיע למנהל
    await db().insert(customFields).values({ organizationId: s.organizationId, entity: "student", key: "secret", labelHe: "הערת הנהלה", type: "text", visibleToRoles: ["manager"], editableByRoles: ["manager"] });
    expect((await buildReport(db(), c1, "students")).columns.some((c) => c.key === "cf:הערת הנהלה")).toBe(false);
    expect((await buildReport(db(), manager, "students")).columns.some((c) => c.key === "cf:הערת הנהלה")).toBe(true);
  });

  it("שם שמתחיל ב-= נשמר כטקסט ולא כנוסחה", async () => {
    const buf = await reportToXlsx({ kind: "students", yearName: "x", columns: [{ key: "student", type: "text" }], rows: [{ student: "=1+1" }] }, { title: "t", header: (k) => k, cell: (_k, v) => v });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets[0].getRow(2).getCell(1).value).toBe("=1+1");
  });

  it("תעודת שעות: הסטודנט את שלו; רכז רק של הסטודנט שלו; אחרים נחסמים", async () => {
    const own = await hoursCertificate(db(), st0, st0.id);
    expect(own!.total).toBeCloseTo(await approvedOf(st0.id), 2);
    await expect(hoursCertificate(db(), st0, st2.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(hoursCertificate(db(), c1, st2.id)).rejects.toBeInstanceOf(ForbiddenError); // סטודנטית של רכז 2
    expect((await hoursCertificate(db(), c2, st2.id))!.student).toContain(s.students[2].firstName);
    expect(await hoursCertificate(db(), manager, st2.id)).not.toBeNull();
    await expect(hoursCertificate(db(), interviewer, st0.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
