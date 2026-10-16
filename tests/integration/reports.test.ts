import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import { auditLog, hourReports, placements } from "@/lib/db/schema";
import { deleteOrganization, seedDemo } from "@/lib/db/seed";
import { ForbiddenError, type Role, type SessionUser } from "@/lib/permissions";
import { approveMany, decide, getMyReport, listInbox, listMyReports, myProgress, reportablePlacements, resubmitReport, submitReport, type SubmitInput } from "@/lib/services/reports";
import { NotFoundError } from "@/lib/services/users";
import { registerProvider, resetProviders, type NotifyInput } from "@/lib/services/notify";

type Seed = Awaited<ReturnType<typeof seedDemo>>;
let s: Seed;
const act = (u: { id: string }, org: string, roles: Role[]): SessionUser => ({ id: u.id, organizationId: org, roles });
let manager: SessionUser, c1: SessionUser, c2: SessionUser, interviewer: SessionUser, st: SessionUser, other: SessionUser, placementId: string;

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
const vol = (over: Partial<SubmitInput> = {}): SubmitInput => ({ type: "volunteering", placementId, volunteerDate: daysAgo(1), reportedHours: 3, ...over });

beforeAll(async () => {
  s = await seedDemo(db(), { orgName: `דיווחים ${Date.now()}` });
  manager = act(s.manager, s.organizationId, ["manager"]);
  c1 = act(s.coordinators[0], s.organizationId, ["coordinator"]);
  c2 = act(s.coordinators[1], s.organizationId, ["coordinator"]);
  interviewer = act(s.interviewer, s.organizationId, ["interviewer"]);
  st = act(s.students[0], s.organizationId, ["student"]);
  other = act(s.students[2], s.organizationId, ["student"]);
  const [p] = await db().select().from(placements).where(and(eq(placements.studentId, st.id), eq(placements.isActive, true)));
  placementId = p.id;
  await db().delete(hourReports).where(eq(hourReports.organizationId, s.organizationId)); // מתחילים נקי
});
afterAll(async () => {
  if (s) await deleteOrganization(db(), s.organizationId);
  await closeDb();
});

describe("הגשה", () => {
  it("ברירות מחדל מהחוזה, והדיווח נשמר עם מצב pending ו-approved = reported", async () => {
    const pls = await reportablePlacements(db(), st);
    expect(pls).toHaveLength(1);
    expect(pls[0].defaultHours).toBeGreaterThan(0);
    const id = await submitReport(db(), st, vol({ reportedHours: 2.5 }));
    const r = await getMyReport(db(), st, id);
    expect(r).toMatchObject({ status: "pending", reportedHours: 2.5, approvedHours: 2.5, coordinatorId: c1.id });
  });

  it("כפילות לאותו שיבוץ ביום, תאריך עתידי, מחוץ לשנה, שעות לא תקינות, שיבוץ של מישהו אחר", async () => {
    await expect(submitReport(db(), st, vol())).rejects.toMatchObject({ code: "duplicate" });
    await expect(submitReport(db(), st, vol({ volunteerDate: "2999-01-01" }))).rejects.toMatchObject({ code: "future_date" });
    await expect(submitReport(db(), st, vol({ volunteerDate: "2020-01-01" }))).rejects.toMatchObject({ code: "outside_year" });
    await expect(submitReport(db(), st, vol({ volunteerDate: daysAgo(2), reportedHours: 0 }))).rejects.toMatchObject({ code: "bad_hours" });
    await expect(submitReport(db(), st, vol({ volunteerDate: daysAgo(2), startTime: "12:00", endTime: "11:00" }))).rejects.toMatchObject({ code: "bad_time" });
    await expect(submitReport(db(), other, vol({ volunteerDate: daysAgo(2) }))).rejects.toMatchObject({ code: "not_your_placement" });
  });

  it("תקרת שעות ליום מהמסלול (8)", async () => {
    await expect(submitReport(db(), st, vol({ volunteerDate: daysAgo(3), reportedHours: 9 }))).rejects.toMatchObject({ code: "day_over_max" });
  });

  it("הגשות מקבילות לאותו יום: בדיוק אחת עוברת", async () => {
    const results = await Promise.allSettled([1, 2, 3].map(() => submitReport(db(), st, vol({ volunteerDate: daysAgo(4) }))));
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });

  it("היעדרות: סיבה חובה, בלי שיבוץ, ולא נספרת עד אישור", async () => {
    await expect(submitReport(db(), st, { type: "absence", volunteerDate: daysAgo(5), reportedHours: 4 })).rejects.toMatchObject({ code: "bad_reason" });
    const id = await submitReport(db(), st, { type: "absence", volunteerDate: daysAgo(5), reportedHours: 4, absenceReason: "reserve_duty" });
    expect((await getMyReport(db(), st, id)).placementId).toBeNull();
  });

  it("רק סטודנט מגיש; רכז/מראיין נחסמים", async () => {
    await expect(submitReport(db(), c1, vol({ volunteerDate: daysAgo(6) }))).rejects.toThrow();
    await expect(submitReport(db(), interviewer, vol({ volunteerDate: daysAgo(6) }))).rejects.toThrow();
  });
});

describe("תיבת רכז והחלטות", () => {
  let id: string;
  it("רכז רואה רק את הסטודנטים שלו; רכז אחר ומראיין לא", async () => {
    id = (await listMyReports(db(), st)).find((r) => r.volunteerDate === daysAgo(1))!.id;
    expect((await listInbox(db(), c1, { status: "pending" })).some((r) => r.id === id)).toBe(true);
    expect((await listInbox(db(), c2)).some((r) => r.id === id)).toBe(false);
    expect((await listInbox(db(), manager)).some((r) => r.id === id)).toBe(true);
    await expect(listInbox(db(), interviewer)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(decide(db(), c2, id, { kind: "approve" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("אישור עם עריכת שעות: reported_hours נשאר, approved משתנה, נרשם בלוג, ורק approved נספר", async () => {
    expect((await myProgress(db(), st)).approved).toBe(0);
    await decide(db(), c1, id, { kind: "approve", approvedHours: 2 });
    const [r] = await db().select().from(hourReports).where(eq(hourReports.id, id));
    expect(r).toMatchObject({ status: "approved", reportedHours: 2.5, approvedHours: 2, approvedBy: c1.id });
    expect(r.approvedAt).not.toBeNull();
    expect((await myProgress(db(), st)).approved).toBe(2);
    const log = await db().select().from(auditLog).where(and(eq(auditLog.entityId, id), eq(auditLog.action, "approve")));
    expect(log).toHaveLength(1);
  });

  it("אי אפשר להחליט פעמיים; ביטול אישור דורש סיבה, מחזיר ל-pending ונרשם", async () => {
    await expect(decide(db(), c1, id, { kind: "approve" })).rejects.toMatchObject({ code: "bad_transition" });
    await expect(decide(db(), c1, id, { kind: "unapprove", reason: "טעות בספירה" })).rejects.toBeInstanceOf(ForbiddenError); // רק מנהל
    await expect(decide(db(), manager, id, { kind: "unapprove", reason: "  " })).rejects.toMatchObject({ code: "reason_required" });
    await decide(db(), manager, id, { kind: "unapprove", reason: "טעות בספירה" });
    const [r] = await db().select().from(hourReports).where(eq(hourReports.id, id));
    // השעות המאושרות חוזרות לערך שדווח (לא נשאר 2 מהאישור הקודם)
    expect(r).toMatchObject({ status: "pending", approvedBy: null, approvedHours: 2.5, reportedHours: 2.5 });
    expect((await myProgress(db(), st)).approved).toBe(0);
    const [log] = await db().select().from(auditLog).where(and(eq(auditLog.entityId, id), eq(auditLog.action, "unapprove")));
    expect(log.reason).toBe("טעות בספירה");
  });

  it("הרכז לא מאשר יותר שעות ממה שדווח", async () => {
    await expect(decide(db(), c1, id, { kind: "approve", approvedHours: 10 })).rejects.toMatchObject({ code: "bad_hours" });
    await expect(decide(db(), c1, id, { kind: "approve", approvedHours: 2.51 })).rejects.toMatchObject({ code: "bad_hours" });
  });

  it("דחייה והחזרה לתיקון דורשות סיבה; סטודנט מתקן ומחזיר ל-pending; נדחה סופי", async () => {
    await expect(decide(db(), c1, id, { kind: "needs_correction", notes: "" })).rejects.toMatchObject({ code: "reason_required" });
    await decide(db(), c1, id, { kind: "needs_correction", notes: "חסרה שעת סיום" });
    expect((await getMyReport(db(), st, id)).coordinatorNotes).toBe("חסרה שעת סיום");
    await resubmitReport(db(), st, id, vol({ reportedHours: 3, startTime: "16:00", endTime: "19:00" }));
    expect(await getMyReport(db(), st, id)).toMatchObject({ status: "pending", reportedHours: 3, approvedHours: 3 });
    await decide(db(), c1, id, { kind: "reject", notes: "לא הגיע" });
    await expect(resubmitReport(db(), st, id, vol())).rejects.toMatchObject({ code: "not_editable" });
    expect((await myProgress(db(), st)).approved).toBe(0);
  });

  it("סטודנט אחר לא מתקן דיווח שאינו שלו; סטודנט לא מאשר", async () => {
    await expect(resubmitReport(db(), other, id, vol())).rejects.toThrow();
    await expect(decide(db(), st, id, { kind: "approve" })).rejects.toThrow();
  });

  it("היעדרות: אישור עם countsTowardTarget=false לא נספרת", async () => {
    const abs = (await listMyReports(db(), st)).find((r) => r.reportType === "absence")!;
    await decide(db(), c1, abs.id, { kind: "approve", countsTowardTarget: false });
    expect((await myProgress(db(), st)).approved).toBe(0);
  });

  it("החלטות מקבילות על אותו דיווח: בדיוק אחת מצליחה", async () => {
    const fresh = await submitReport(db(), st, vol({ volunteerDate: daysAgo(8) }));
    const res = await Promise.allSettled([decide(db(), c1, fresh, { kind: "approve" }), decide(db(), manager, fresh, { kind: "reject", notes: "x" })]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });
});

describe("שיבוץ שהסתיים, ותאריך מחוץ לתקופת השיבוץ (ביקורת Fable)", () => {
  beforeAll(async () => {
    // תחילת השיבוץ בעבר רחוק מספיק, כדי שהבדיקות לא יהיו תלויות בתאריך ה-seed
    await db().update(placements).set({ startedAt: "2026-10-01" }).where(eq(placements.id, placementId));
  });
  it("אי אפשר לדווח לפני תחילת השיבוץ", async () => {
    await db().update(placements).set({ startedAt: daysAgo(3) }).where(eq(placements.id, placementId));
    try {
      await expect(submitReport(db(), st, vol({ volunteerDate: daysAgo(7) }))).rejects.toMatchObject({ code: "not_your_placement" });
    } finally {
      await db().update(placements).set({ startedAt: "2026-10-01" }).where(eq(placements.id, placementId));
    }
  });

  it("דיווח שהוחזר לתיקון לא נתקע אחרי שיבוץ מחדש: מותר בתוך תקופת השיבוץ שהסתיים, אסור אחריה", async () => {
    const day = daysAgo(12);
    const id = await submitReport(db(), st, vol({ volunteerDate: day }));
    await decide(db(), c1, id, { kind: "needs_correction", notes: "תקנו שעות" });
    // השיבוץ מוחלף ונסגר לפני שבוע
    await db().update(placements).set({ isActive: false, endedAt: daysAgo(9) }).where(eq(placements.id, placementId));
    try {
      await expect(resubmitReport(db(), st, id, vol({ volunteerDate: day, reportedHours: 2 }))).resolves.toBeUndefined();
      await expect(submitReport(db(), st, vol({ volunteerDate: daysAgo(1) }))).rejects.toMatchObject({ code: "not_your_placement" }); // אחרי סיום השיבוץ
      await expect(submitReport(db(), st, vol({ volunteerDate: daysAgo(11) }))).resolves.toBeTruthy(); // בתוך התקופה
    } finally {
      await db().update(placements).set({ isActive: true, endedAt: null }).where(eq(placements.id, placementId));
    }
  });

  it("שורת טיוטה שלא הופעלה אף פעם אינה שיבוץ לדיווח", async () => {
    const [p] = await db().select().from(placements).where(eq(placements.id, placementId));
    const [draft] = await db().insert(placements).values({ ...p, id: undefined, isActive: false, startedAt: null, endedAt: null }).returning();
    try {
      await expect(submitReport(db(), st, vol({ placementId: draft.id, volunteerDate: daysAgo(10) }))).rejects.toMatchObject({ code: "not_your_placement" });
    } finally {
      await db().delete(placements).where(eq(placements.id, draft.id));
    }
  });

  it("ביטול אישור מחדש את מועד ההגשה, כדי שההסלמה תספור מהחזרה לתור", async () => {
    const id = await submitReport(db(), st, vol({ volunteerDate: daysAgo(10) }));
    await decide(db(), c1, id, { kind: "approve" });
    const [a] = await db().select().from(hourReports).where(eq(hourReports.id, id));
    await new Promise((r) => setTimeout(r, 20));
    await decide(db(), manager, id, { kind: "unapprove", reason: "בדיקה" });
    const [b] = await db().select().from(hourReports).where(eq(hourReports.id, id));
    expect(b.submittedAt.getTime()).toBeGreaterThan(a.submittedAt.getTime());
  });
});

describe("תיבת הרכז: היקף ב-SQL, מסננים ואישור מרובה (ביקורת Fable)", () => {
  let a: string, b: string, placeId: string;
  beforeAll(async () => {
    const [p] = await db().select().from(placements).where(eq(placements.id, placementId));
    placeId = p.placeId;
    a = await submitReport(db(), st, vol({ volunteerDate: daysAgo(13) }));
    b = await submitReport(db(), st, vol({ volunteerDate: daysAgo(14) }));
  });

  it("רכז רואה רק סטודנטים שלו, גם כשיש הרבה דיווחים; מנהל רואה הכול", async () => {
    const mine = await listInbox(db(), c1, { status: "pending" });
    expect(mine.map((r) => r.id)).toEqual(expect.arrayContaining([a, b]));
    expect((await listInbox(db(), c2, { status: "pending" })).map((r) => r.id)).not.toEqual(expect.arrayContaining([a]));
    expect((await listInbox(db(), manager, { status: "pending" })).length).toBeGreaterThanOrEqual(mine.length);
  });

  it("מסנני סטודנט, מקום וחודש", async () => {
    expect((await listInbox(db(), c1, { status: "pending", studentId: st.id })).every((r) => r.studentId === st.id)).toBe(true);
    expect((await listInbox(db(), c1, { status: "pending", studentId: other.id })).length).toBe(0);
    expect((await listInbox(db(), c1, { status: "pending", placeId })).map((r) => r.id)).toEqual(expect.arrayContaining([a, b]));
    expect((await listInbox(db(), c1, { status: "pending", placeId: "00000000-0000-0000-0000-000000000000" })).length).toBe(0);
    const month = daysAgo(13).slice(0, 7);
    const inMonth = await listInbox(db(), c1, { status: "pending", month });
    expect(inMonth.length).toBeGreaterThan(0);
    expect(inMonth.every((r) => r.volunteerDate.startsWith(month))).toBe(true);
  });

  it("אישור מרובה: מאשר בשעות שדווחו; דיווח שכבר טופל או של רכז אחר נספר ככישלון ולא מפיל את השאר", async () => {
    await decide(db(), c1, b, { kind: "approve" }); // b כבר טופל
    const r = await approveMany(db(), c1, [a, b, "00000000-0000-0000-0000-000000000000"]);
    expect(r).toEqual({ approved: 1, failed: 2 });
    const [ra] = await db().select().from(hourReports).where(eq(hourReports.id, a));
    expect(ra).toMatchObject({ status: "approved", approvedHours: ra.reportedHours });
    // רכז אחר לא מאשר דיווח של סטודנט שאינו שלו
    const c = await submitReport(db(), st, vol({ volunteerDate: daysAgo(15) }));
    expect(await approveMany(db(), c2, [c])).toEqual({ approved: 0, failed: 1 });
  });

  it("אישור מרובה שולח הודעה אחת לסטודנט (מאוחדת), לא אחת לכל דיווח", async () => {
    const x = await submitReport(db(), st, vol({ volunteerDate: daysAgo(2) }));
    const y = await submitReport(db(), st, vol({ volunteerDate: daysAgo(3) }));
    const sent: NotifyInput[] = [];
    registerProvider("email", { async send(i) { sent.push(i); } });
    try {
      expect(await approveMany(db(), c1, [x, y])).toEqual({ approved: 2, failed: 0 });
    } finally { resetProviders(); }
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ template: "report.approved_many", data: { count: 2 } });
  });
});
