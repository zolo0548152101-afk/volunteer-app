import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import { auditLog, interviews, placements, users } from "@/lib/db/schema";
import { deleteOrganization, seedDemo } from "@/lib/db/seed";
import { windowUsageRows } from "@/lib/db/queries/capacity";
import { ForbiddenError, type Role, type SessionUser } from "@/lib/permissions";
import { weeksRemaining } from "@/lib/services/capacity";
import {
  cancelInterview, ContractError, finalizeInterview, getDraft, InterviewError, listCandidateWindows, listCoordinatorsWithLoad, saveDraft, startInterview, studentHistory,
  type DraftLine,
} from "@/lib/services/interviews";

type Seed = Awaited<ReturnType<typeof seedDemo>>;
let s: Seed;
const act = (u: { id: string }, org: string, roles: Role[]): SessionUser => ({ id: u.id, organizationId: org, roles });
let manager: SessionUser, c1: SessionUser, c2: SessionUser, interviewer: SessionUser, st: SessionUser;

beforeAll(async () => {
  s = await seedDemo(db(), { orgName: `ראיונות ${Date.now()}` });
  manager = act(s.manager, s.organizationId, ["manager"]);
  c1 = act(s.coordinators[0], s.organizationId, ["coordinator"]);
  c2 = act(s.coordinators[1], s.organizationId, ["coordinator"]);
  interviewer = act(s.interviewer, s.organizationId, ["interviewer"]);
  st = act(s.students[0], s.organizationId, ["student"]);
});
afterAll(async () => {
  if (s) await deleteOrganization(db(), s.organizationId);
  await closeDb();
});

/** חוזה שעומד ביעד (140 ש') בלי תלות בתאריך הריצה: שעות שבועיות = יעד / שבועות שנותרו, מפוצל בין שני חלונות אם צריך */
function fitLines(): DraftLine[] {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
  const weekly = Math.round((140 / weeksRemaining(today, "2027-06-30")) * 100) / 100;
  const base = { assignedDays: ["tue"] as DraftLine["assignedDays"] };
  if (weekly <= 6) return [{ timeWindowId: s.windows.youthTue.id, slots: 2, weeklyHours: weekly, ...base }];
  return [
    { timeWindowId: s.windows.youthTue.id, slots: 2, weeklyHours: 6, ...base },
    { timeWindowId: s.windows.eldersMorning.id, slots: 1, weeklyHours: Math.round((weekly - 6) * 100) / 100, assignedDays: ["sun"] },
  ];
}
const underLines = (): DraftLine[] => [{ timeWindowId: s.windows.kgMorning.id, slots: 0.25, weeklyHours: 0.5, assignedDays: ["sun"] }];
const activeOf = (id: string) => db().select().from(placements).where(and(eq(placements.studentId, id), eq(placements.isActive, true)));

describe("טיוטה והרשאות", () => {
  it("רק מראיין/מנהל פותחים ראיון; רכז וסטודנט נחסמים", async () => {
    const lian = s.students[4].id;
    await expect(startInterview(db(), c1, lian, "interview")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(startInterview(db(), st, lian, "interview")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(startInterview(db(), interviewer, c1.id, "interview")).rejects.toBeInstanceOf(InterviewError); // לא סטודנט
  });

  it("טיוטה אחת לסטודנט: פתיחה חוזרת מחזירה את אותה אחת; סוג אחר נדחה", async () => {
    const a = await startInterview(db(), interviewer, s.students[4].id, "interview");
    expect(await startInterview(db(), interviewer, s.students[4].id, "interview")).toBe(a);
    await expect(startInterview(db(), manager, s.students[4].id, "reassignment")).rejects.toMatchObject({ code: "already_has_draft" });
    await cancelInterview(db(), interviewer, a);
    const [row] = await db().select().from(interviews).where(eq(interviews.id, a));
    expect(row.status).toBe("cancelled");
  });

  it("שיבוץ מחדש: רק הרכז של הסטודנט או מנהל", async () => {
    await expect(startInterview(db(), c2, s.students[0].id, "reassignment")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(startInterview(db(), interviewer, s.students[0].id, "reassignment")).rejects.toBeInstanceOf(ForbiddenError);
    const id = await startInterview(db(), c1, s.students[0].id, "reassignment");
    // נפתח עם החוזה הנוכחי של שירה
    const d = await getDraft(db(), c1, id);
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0]).toMatchObject({ timeWindowId: s.windows.eldersMorning.id, isActive: false });
    await cancelInterview(db(), c1, id);
    expect(await activeOf(s.students[0].id)).toHaveLength(1); // החוזה הפעיל לא נפגע
  });

  it("רכז לא עורך את הטיוטה של סטודנט אחר", async () => {
    const id = await startInterview(db(), manager, s.students[2].id, "reassignment");
    await expect(saveDraft(db(), c1, id, { lines: [] })).rejects.toBeInstanceOf(ForbiddenError);
    await cancelInterview(db(), manager, id);
  });
});

describe("חלונות מועמדים", () => {
  it("ממוינים לפי חפיפת ימים והתאמת סוג; חלון מלא לא מופיע", async () => {
    const lian = s.students[4].id;
    await db().execute(((await import("drizzle-orm")).sql)`UPDATE student_profiles SET available_days = ARRAY['tue']::day[], preferred_types = ARRAY['at_risk_youth']::text[] WHERE user_id = ${lian}`);
    const list = await listCandidateWindows(db(), interviewer, lian);
    expect(list[0].windowId).toBe(s.windows.youthTue.id);
    expect(list[0]).toMatchObject({ typeMatch: true, overlapDays: ["tue"] });
    expect(list.find((c) => c.windowId === s.windows.clinicHalf.id)).toBeUndefined(); // חצי התקן תפוס
    expect((await listCandidateWindows(db(), interviewer, lian, { city: "חיפה" })).every((c) => c.city === "חיפה")).toBe(true);
    expect((await listCandidateWindows(db(), interviewer, lian, { day: "thu" })).every((c) => c.days.includes("thu"))).toBe(true);
  });
  it("הסטודנט לא רואה את הרשימה (קיבולת)", async () => {
    await expect(listCandidateWindows(db(), st, st.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("סגירת ראיון", () => {
  it("חוזה תקין: מפעיל שיבוצים, בוחר רכז, משבית קודמים, ורושם הכל", async () => {
    const lian = s.students[4].id;
    const id = await startInterview(db(), interviewer, lian, "interview");
    const ev = await saveDraft(db(), interviewer, id, { fields: { summary: "מתאימה", generalImpression: "suitable" }, lines: fitLines() });
    expect(ev.blocked).toBe(false);
    expect(ev.needsManagerOverride).toBe(false);
    expect(ev.bank?.status).toBe("ok");
    await expect(finalizeInterview(db(), interviewer, id)).rejects.toMatchObject({ code: "need_coordinator" });
    const res = await finalizeInterview(db(), interviewer, id, { coordinatorId: c2.id });
    expect(res).toMatchObject({ coordinatorId: c2.id, deactivated: 0 });
    expect((await activeOf(lian)).length).toBe(res.activated);
    const [u] = await db().select().from(users).where(eq(users.id, lian));
    expect(u.coordinatorId).toBe(c2.id);
    const logs = await db().select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(logs.map((l) => l.action)).toContain("finalize");
    // ראיון סגור לא נערך
    await expect(saveDraft(db(), interviewer, id, { lines: [] })).rejects.toMatchObject({ code: "not_draft" });
    await expect(finalizeInterview(db(), interviewer, id)).rejects.toMatchObject({ code: "not_draft" });
    // התפוסה במסד משקפת את החוזה
    const usage = await windowUsageRows(db(), s.organizationId);
    expect(usage.find((x) => x.windowId === s.windows.youthTue.id)!.allocatedSlots).toBeGreaterThanOrEqual(3);
  });

  it("שיבוץ מחדש על ידי הרכז: הישנים הופכים ללא פעילים וההיסטוריה נשמרת", async () => {
    const lian = s.students[4].id;
    const before = await activeOf(lian);
    const id = await startInterview(db(), c2, lian, "reassignment");
    await saveDraft(db(), c2, id, { lines: fitLines().map((l) => ({ ...l, description: "שונה" })) });
    const res = await finalizeInterview(db(), c2, id);
    expect(res.deactivated).toBe(before.length);
    const all = await db().select().from(placements).where(eq(placements.studentId, lian));
    expect(all.filter((p) => p.isActive)).toHaveLength(res.activated);
    expect(all.filter((p) => !p.isActive && p.endedAt)).toHaveLength(before.length);
    const h = await studentHistory(db(), c2, lian);
    expect(h.interviews.map((i) => i.kind)).toContain("reassignment");
    expect(h.placements.length).toBe(before.length + res.activated);
  });

  it("חריגה מחלון נחסמת וכלום לא משתנה", async () => {
    const tomer = s.students[5].id;
    const id = await startInterview(db(), interviewer, tomer, "interview");
    // מרפאה: חצי תקן תפוס לגמרי
    const ev = await saveDraft(db(), interviewer, id, { lines: [{ timeWindowId: s.windows.clinicHalf.id, slots: 0.25, weeklyHours: 1, assignedDays: ["wed"] }] });
    expect(ev.blocked).toBe(true);
    await expect(finalizeInterview(db(), interviewer, id, { coordinatorId: c1.id })).rejects.toBeInstanceOf(ContractError);
    expect(await activeOf(tomer)).toHaveLength(0);
    const [u] = await db().select().from(users).where(eq(users.id, tomer));
    expect(u.coordinatorId).toBeNull();
    // אותו חלון פעמיים באותו חוזה
    const ev2 = await saveDraft(db(), interviewer, id, { lines: [
      { timeWindowId: s.windows.eldersThu.id, slots: 0.25, weeklyHours: 0.5, assignedDays: ["thu"] },
      { timeWindowId: s.windows.eldersThu.id, slots: 0.25, weeklyHours: 0.5, assignedDays: ["thu"] }] });
    expect(ev2.issues.some((i) => i.code === "duplicate_window")).toBe(true);
    await cancelInterview(db(), interviewer, id);
  });

  it("פער מהיעד: מראיין נחסם, מנהל חייב סיבה, ואז נרשם override", async () => {
    const tomer = s.students[5].id;
    const id = await startInterview(db(), interviewer, tomer, "interview");
    const ev = await saveDraft(db(), interviewer, id, { lines: underLines() });
    expect(ev.blocked).toBe(false);
    expect(ev.needsManagerOverride).toBe(true);
    await expect(finalizeInterview(db(), interviewer, id, { coordinatorId: c1.id, overrideReason: "x" })).rejects.toBeInstanceOf(ContractError);
    // מנהל משלים את אותה טיוטה
    await expect(finalizeInterview(db(), manager, id, { coordinatorId: c1.id })).rejects.toMatchObject({ code: "override_reason_required" });
    const res = await finalizeInterview(db(), manager, id, { coordinatorId: c1.id, overrideReason: "סטודנט עם הגבלת זמינות מאושרת" });
    expect(res.activated).toBe(1);
    const log = await db().select().from(auditLog).where(and(eq(auditLog.entityId, id), eq(auditLog.action, "override")));
    expect(log[0].reason).toBe("סטודנט עם הגבלת זמינות מאושרת");
  });

  it("שני סטודנטים סוגרים במקביל את התקן האחרון: רק אחד מצליח", async () => {
    // eldersThu: 1.5 תקנים, עומר 0.5 → נשאר 1. שני הסטודנטים מבקשים 1 תקן
    const a = s.students[0].id, b = s.students[1].id; // שירה ואיתי, שניהם עם רכז
    const ida = await startInterview(db(), manager, a, "reassignment");
    const idb = await startInterview(db(), manager, b, "reassignment");
    const line: DraftLine = { timeWindowId: s.windows.eldersThu.id, slots: 1, weeklyHours: 3, assignedDays: ["thu"] };
    await saveDraft(db(), manager, ida, { lines: [line] });
    await saveDraft(db(), manager, idb, { lines: [line] });
    const results = await Promise.allSettled([
      finalizeInterview(db(), manager, ida, { overrideReason: "בדיקה" }),
      finalizeInterview(db(), manager, idb, { overrideReason: "בדיקה" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ContractError);
    const usage = await windowUsageRows(db(), s.organizationId);
    expect(usage.find((x) => x.windowId === s.windows.eldersThu.id)!.remainingSlots).toBe(0);
  });

  it("רשימת רכזים לבחירה כוללת עומס", async () => {
    const l = await listCoordinatorsWithLoad(db(), interviewer);
    expect(l).toHaveLength(2);
    expect(l.every((c) => typeof c.students === "number")).toBe(true);
    await expect(listCoordinatorsWithLoad(db(), st)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
