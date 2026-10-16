import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import { hourReports, notificationLog, notificationRules } from "@/lib/db/schema";
import { deleteOrganization, seedDemo } from "@/lib/db/seed";
import { registerProvider, resetProviders, type NotifyInput } from "@/lib/services/notify";
import { runEscalation, runReminders } from "@/lib/services/cron";

type Seed = Awaited<ReturnType<typeof seedDemo>>;
let s: Seed;
let sent: NotifyInput[] = [];
let failing = false;
const spy = { async send(i: NotifyInput) { if (failing) throw new Error("boom"); sent.push(i); } };
const later = (days: number) => new Date(Date.now() + days * 86_400_000);
const setRule = (kind: string, patch: Partial<typeof notificationRules.$inferInsert>) =>
  db().update(notificationRules).set(patch).where(and(eq(notificationRules.organizationId, s.organizationId), eq(notificationRules.kind, kind)));
const logs = (kind: string) => db().select().from(notificationLog).where(and(eq(notificationLog.organizationId, s.organizationId), eq(notificationLog.kind, kind)));
const only = (template: string) => sent.filter((x) => x.template === template);

beforeAll(async () => {
  s = await seedDemo(db(), { orgName: `קרון ${Date.now()}` });
  registerProvider("email", spy);
});
afterEach(async () => {
  sent = [];
  failing = false;
  await db().delete(notificationLog).where(eq(notificationLog.organizationId, s.organizationId));
});
afterAll(async () => {
  resetProviders();
  if (s) await deleteOrganization(db(), s.organizationId);
  await closeDb();
});

const pendingCount = async () => (await db().select().from(hourReports).where(and(eq(hourReports.organizationId, s.organizationId), eq(hourReports.status, "pending")))).length;

describe("הסלמת דיווחים", () => {
  it("לא לפני הזמן; אחרי 7 ימים נשלח לרכז, עותק למנהל, ופעם אחת בלבד", async () => {
    const n = await pendingCount();
    expect(n).toBeGreaterThan(0);
    // בנתוני הדמו יש דיווח שממתין כבר 8 ימים: הוא כן מוסלם מוקדם. האחרים לא
    const overdueNow = (await db().select().from(hourReports).where(and(eq(hourReports.organizationId, s.organizationId), eq(hourReports.status, "pending"))))
      .filter((x) => x.submittedAt.getTime() <= later(3).getTime() - 7 * 86_400_000).length;
    expect((await runEscalation(db(), { organizationId: s.organizationId, now: later(3) })).sent).toBe(overdueNow);
    const r = await runEscalation(db(), { organizationId: s.organizationId, now: later(9) });
    expect(r.sent).toBe(n - overdueNow);
    const esc = only("report.escalation");
    expect(esc.some((x) => x.to === s.coordinators[0].email)).toBe(true);
    expect(esc.some((x) => x.to === s.manager.email)).toBe(true); // עותק למנהל
    expect(esc[0].subject).toMatch(/ממתין לאישור כבר \d+ ימים/);
    expect((await logs("report_escalation")).filter((l) => l.ok)).toHaveLength(n);
    sent = [];
    expect(await runEscalation(db(), { organizationId: s.organizationId, now: later(30) })).toMatchObject({ sent: 0 });
    expect(sent).toHaveLength(0);
  });

  it("הרצות מקבילות: כל דיווח מוסלם פעם אחת בלבד", async () => {
    const n = await pendingCount();
    await Promise.all([1, 2, 3].map(() => runEscalation(db(), { organizationId: s.organizationId, now: later(9) })));
    expect((await logs("report_escalation")).filter((l) => l.ok)).toHaveLength(n);
    expect(only("report.escalation").filter((x) => x.to !== s.manager.email)).toHaveLength(n);
  });

  it("כבוי בהגדרות: לא שולח", async () => {
    await setRule("report_escalation", { enabled: false });
    expect(await runEscalation(db(), { organizationId: s.organizationId, now: later(30) })).toMatchObject({ sent: 0 });
    await setRule("report_escalation", { enabled: true });
  });

  it("כמה פעמים וכל כמה זמן: מהכלל, לא מהקוד", async () => {
    await setRule("report_escalation", { firstAfterDays: 2, maxSends: 2, repeatEveryDays: 3, copyManager: false });
    const n = await pendingCount();
    await runEscalation(db(), { organizationId: s.organizationId, now: later(9) });
    expect(sent).toHaveLength(n);
    await runEscalation(db(), { organizationId: s.organizationId, now: later(10) }); // רק יום מהשליחה
    expect(sent).toHaveLength(n);
    await runEscalation(db(), { organizationId: s.organizationId, now: later(13) }); // 3+ ימים
    expect(sent).toHaveLength(2 * n);
    await runEscalation(db(), { organizationId: s.organizationId, now: later(40) }); // הגיע למקסימום
    expect(sent).toHaveLength(2 * n);
    await setRule("report_escalation", { firstAfterDays: 7, maxSends: 1, repeatEveryDays: 7, copyManager: true });
  });

  it("שליחה שנכשלה לא נספרת ומנוסה שוב בהרצה הבאה", async () => {
    const n = await pendingCount();
    failing = true;
    const r1 = await runEscalation(db(), { organizationId: s.organizationId, now: later(9) });
    expect(r1).toMatchObject({ sent: 0, failed: n });
    expect((await logs("report_escalation")).every((l) => !l.ok)).toBe(true);
    failing = false;
    expect((await runEscalation(db(), { organizationId: s.organizationId, now: later(9) })).sent).toBe(n);
  });

  it("עותק למנהל נרשם ביומן בנפרד ולא נספר כשליחה לנמען הראשי", async () => {
    await setRule("report_escalation", { firstAfterDays: 7, maxSends: 1, repeatEveryDays: 7, copyManager: true });
    const n = await pendingCount();
    await runEscalation(db(), { organizationId: s.organizationId, now: later(9) });
    expect((await logs("report_escalation")).filter((l) => l.ok)).toHaveLength(n);
    expect((await logs("report_escalation_copy")).length).toBeGreaterThan(0);
    sent = [];
    await runEscalation(db(), { organizationId: s.organizationId, now: later(10) });
    expect(sent).toHaveLength(0); // ההסלמה לא חוזרת
  });

  it("דיווח שהוגש מחדש מתחיל ספירה חדשה", async () => {
    await runEscalation(db(), { organizationId: s.organizationId, now: later(9) });
    const [r] = await db().select().from(hourReports).where(and(eq(hourReports.organizationId, s.organizationId), eq(hourReports.status, "pending")));
    await db().update(hourReports).set({ submittedAt: later(12) }).where(eq(hourReports.id, r.id)); // הוגש מחדש אחרי ההסלמה
    sent = [];
    await runEscalation(db(), { organizationId: s.organizationId, now: later(13) });
    expect(sent).toHaveLength(0); // הוגש רק לפני יום
    await runEscalation(db(), { organizationId: s.organizationId, now: later(20) });
    expect(sent.some((x) => x.data?.student)).toBe(true);
  });
});

describe("תזכורות", () => {
  it("סטודנט שלא דיווח 21 ימים מקבל פעם אחת; לפני כן לא", async () => {
    expect(only("student.inactivity")).toHaveLength(0);
    await runReminders(db(), { organizationId: s.organizationId, now: later(5) });
    expect(only("student.inactivity")).toHaveLength(0);
    await runReminders(db(), { organizationId: s.organizationId, now: later(60) });
    const first = only("student.inactivity").length;
    expect(first).toBeGreaterThan(0);
    await runReminders(db(), { organizationId: s.organizationId, now: later(90) });
    expect(only("student.inactivity")).toHaveLength(first);
  });

  it("סיכום יומי לרכז: פעם ביום, ורק למי שיש לו ממתינים", async () => {
    await setRule("student_inactivity", { enabled: false });
    await runReminders(db(), { organizationId: s.organizationId, now: later(1) });
    const d = only("coordinator.digest");
    expect(d.length).toBeGreaterThan(0);
    expect(new Set(d.map((x) => x.to)).size).toBe(d.length);
    await runReminders(db(), { organizationId: s.organizationId, now: later(1) });
    expect(only("coordinator.digest")).toHaveLength(d.length); // אותו יום
    await setRule("student_inactivity", { enabled: true });
  });
});
