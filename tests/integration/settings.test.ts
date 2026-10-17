import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import { academicYears, auditLog, lookups, settings } from "@/lib/db/schema";
import { deleteOrganization, seedDemo } from "@/lib/db/seed";
import { ForbiddenError, type Role, type SessionUser } from "@/lib/permissions";
import { loadAdminSettings, parseMilestones, saveGeneral, saveLookup, saveProgram, saveRule, saveYear } from "@/lib/services/settings";

type Seed = Awaited<ReturnType<typeof seedDemo>>;
let s: Seed;
const act = (u: { id: string }, org: string, roles: Role[]): SessionUser => ({ id: u.id, organizationId: org, roles });
let manager: SessionUser, coord: SessionUser, student: SessionUser;

beforeAll(async () => {
  s = await seedDemo(db(), { orgName: `הגדרות ${Date.now()}` });
  manager = act(s.manager, s.organizationId, ["manager"]);
  coord = act(s.coordinators[0], s.organizationId, ["coordinator"]);
  student = act(s.students[0], s.organizationId, ["student"]);
});
afterAll(async () => {
  if (s) await deleteOrganization(db(), s.organizationId);
  await closeDb();
});

describe("הגדרות: הרשאות", () => {
  it("רק מנהל קורא וכותב; רכז וסטודנט נחסמים בכל פעולה", async () => {
    for (const who of [coord, student]) {
      await expect(loadAdminSettings(db(), who)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(saveGeneral(db(), who, { tolerance: 2, languages: ["he"] })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(saveRule(db(), who, "report_escalation", { enabled: false, firstAfterDays: 1, maxSends: 1, repeatEveryDays: 1, channels: ["email"], copyManager: false })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(saveLookup(db(), who, { kind: "institution", labelHe: "x", isActive: true })).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});

describe("הגדרות: שמירה ולוג", () => {
  it("סף פער ושפות נשמרים, ערכים לא תקינים נדחים, ונרשם בלוג עם ערך קודם", async () => {
    await expect(saveGeneral(db(), manager, { tolerance: -1, languages: ["he"] })).rejects.toMatchObject({ code: "invalid" });
    await expect(saveGeneral(db(), manager, { tolerance: 1, languages: ["fr"] })).rejects.toMatchObject({ code: "invalid" });
    await saveGeneral(db(), manager, { tolerance: 2.5, languages: ["he"] });
    const [row] = await db().select().from(settings).where(eq(settings.organizationId, s.organizationId));
    expect(row).toMatchObject({ capacityToleranceHours: 2.5, languages: ["he"] });
    const [log] = await db().select().from(auditLog).where(and(eq(auditLog.organizationId, s.organizationId), eq(auditLog.action, "update_general")));
    expect(log.actorId).toBe(manager.id);
    expect(log.oldValue).toMatchObject({ capacityToleranceHours: 1 });
  });

  it("שנה חדשה כנוכחית מבטלת את הקודמת; תאריכים הפוכים נדחים", async () => {
    await expect(saveYear(db(), manager, { name: "x", startDate: "2027-09-01", endDate: "2027-01-01" })).rejects.toMatchObject({ code: "bad_dates" });
    const id = await saveYear(db(), manager, { name: "תשפ״ח", startDate: "2027-10-01", endDate: "2028-06-30", reportDeadline: "2028-07-15", makeCurrent: true });
    const years = await db().select().from(academicYears).where(eq(academicYears.organizationId, s.organizationId));
    expect(years.filter((y) => y.isCurrent).map((y) => y.id)).toEqual([id]);
  });

  it("שנה נוכחית: שתי החלפות מקבילות משאירות בדיוק אחת", async () => {
    const [a, b] = await Promise.all([
      saveYear(db(), manager, { name: "א", startDate: "2029-10-01", endDate: "2030-06-30", makeCurrent: true }),
      saveYear(db(), manager, { name: "ב", startDate: "2031-10-01", endDate: "2032-06-30", makeCurrent: true }),
    ]);
    const cur = (await db().select().from(academicYears).where(eq(academicYears.organizationId, s.organizationId))).filter((y) => y.isCurrent);
    expect(cur).toHaveLength(1);
    expect([a, b]).toContain(cur[0].id);
  });

  it("מסלול: אבני דרך בסדר עולה ולא מעל היעד", async () => {
    expect(parseMilestones("45: פעימה 1\n90 - פעימה 2")).toEqual([{ hours: 45, label: "פעימה 1" }, { hours: 90, label: "פעימה 2" }]);
    expect(() => parseMilestones("90: א\n45: ב")).toThrow();
    await expect(saveProgram(db(), manager, { name: "מסלול", requiredHours: 100, milestones: "120: א", isActive: true })).rejects.toMatchObject({ code: "bad_milestones" });
    const id = await saveProgram(db(), manager, { name: "מסלול חדש", requiredHours: 100, maxHoursPerDay: 6, milestones: "50: חצי", isActive: true });
    expect((await loadAdminSettings(db(), manager)).programs.find((p) => p.id === id)).toMatchObject({ requiredHours: 100, maxHoursPerDay: 6 });
  });

  it("כלל התראה: נשמר ומשפיע על loadRules; סוג לא מוכר וערוץ ריק נדחים", async () => {
    await expect(saveRule(db(), manager, "nope", { enabled: true, firstAfterDays: 1, maxSends: 1, repeatEveryDays: 1, channels: ["email"], copyManager: false })).rejects.toMatchObject({ code: "invalid" });
    await expect(saveRule(db(), manager, "report_escalation", { enabled: true, firstAfterDays: 1, maxSends: 1, repeatEveryDays: 1, channels: [], copyManager: false })).rejects.toMatchObject({ code: "invalid" });
    await saveRule(db(), manager, "report_escalation", { enabled: true, firstAfterDays: 3, maxSends: 2, repeatEveryDays: 2, channels: ["email", "sms"], copyManager: false });
    expect((await loadAdminSettings(db(), manager)).rules.report_escalation).toEqual({ enabled: true, firstAfterDays: 3, maxSends: 2, repeatEveryDays: 2, channels: ["email", "sms"], copyManager: false });
  });

  it("רשימת בחירה: מפתח נוצר פעם אחת ולא משתנה בעריכה; כפילות שמות מקבלת מפתח ייחודי", async () => {
    const a = await saveLookup(db(), manager, { kind: "institution", labelHe: "מכללה א", labelEn: "College A", isActive: true });
    const b = await saveLookup(db(), manager, { kind: "institution", labelHe: "מכללה אחרת", labelEn: "College A", isActive: true });
    const rows = await db().select().from(lookups).where(and(eq(lookups.organizationId, s.organizationId), eq(lookups.kind, "institution")));
    const ka = rows.find((r) => r.id === a)!.key, kb = rows.find((r) => r.id === b)!.key;
    expect(ka).toBe("college_a");
    expect(kb).toBe("college_a_2");
    await saveLookup(db(), manager, { id: a, kind: "institution", labelHe: "מכללה א׳", labelEn: "Renamed", isActive: false });
    const [after] = await db().select().from(lookups).where(eq(lookups.id, a));
    expect(after).toMatchObject({ key: ka, labelHe: "מכללה א׳", isActive: false });
  });
});

import { assertRequired, CustomFieldError, listFields } from "@/lib/services/custom-fields";
import { listAllFields, parseOptions, saveField } from "@/lib/services/custom-field-admin";

describe("שדות מותאמים: ניהול", () => {
  it("רק מנהל מנהל שדות", async () => {
    await expect(listAllFields(db(), coord)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveField(db(), coord, { entity: "student", labelHe: "x", type: "text", required: false, visibleToRoles: ["coordinator"], editableByRoles: [], isActive: true })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("שדה חדש נראה רק למי שסומן; עריכה מוגבלת לנראים; מנהל תמיד כלול", async () => {
    const id = await saveField(db(), manager, { entity: "student", labelHe: "גודל חולצה", labelEn: "Shirt size", type: "select", options: "קטן | Small\nגדול | Large", required: false, visibleToRoles: ["coordinator"], editableByRoles: ["coordinator", "student"], isActive: true });
    const [f] = (await listAllFields(db(), manager)).filter((x) => x.id === id);
    expect(f.key).toBe("shirt_size");
    expect(f.visibleToRoles.sort()).toEqual(["coordinator", "manager"]);
    expect(f.editableByRoles.sort()).toEqual(["coordinator", "manager"]); // סטודנט לא רואה, אז לא עורך
    expect((await listFields(db(), coord, "student")).find((x) => x.id === id)).toMatchObject({ canEdit: true });
    expect((await listFields(db(), student, "student")).some((x) => x.id === id)).toBe(false);
  });

  it("סוג ומפתח לא משתנים בעריכה, ומפתחות אפשרויות נשמרים כשהתווית זהה", async () => {
    const id = await saveField(db(), manager, { entity: "place", labelHe: "חניה", type: "select", options: "יש | yes\nאין", required: false, visibleToRoles: [], editableByRoles: [], isActive: true });
    const [before] = (await listAllFields(db(), manager)).filter((x) => x.id === id);
    await saveField(db(), manager, { id, entity: "student", labelHe: "חניה בחצר", type: "text", options: "יש | yes\nאין\nבתשלום", required: true, visibleToRoles: ["student"], editableByRoles: [], isActive: true });
    const [after] = (await listAllFields(db(), manager)).filter((x) => x.id === id);
    expect(after).toMatchObject({ key: before.key, type: "select", entity: "place", required: true });
    expect(after.options.map((o) => o.key).slice(0, 2)).toEqual(before.options.map((o) => o.key));
    expect(after.options).toHaveLength(3);
  });

  it("בחירה בלי אפשרויות נדחית; מפתחות אפשרויות ייחודיים", async () => {
    await expect(saveField(db(), manager, { entity: "student", labelHe: "ריק", type: "select", options: "", required: false, visibleToRoles: [], editableByRoles: [], isActive: true })).rejects.toMatchObject({ code: "invalid" });
    const keys = parseOptions("א | same\nב | same").map((o) => o.key);
    expect(new Set(keys).size).toBe(2);
  });

  it("דף: ברירת מחדל לפי ישות, סינון לפי דף, ושדה לא עובר לדף של ישות אחרת", async () => {
    const reg = await saveField(db(), manager, { entity: "student", labelHe: "ברירת מחדל", type: "text", required: false, visibleToRoles: ["student"], editableByRoles: ["student"], isActive: true });
    const prof = await saveField(db(), manager, { entity: "student", page: "profile", labelHe: "רק בפרופיל", type: "text", required: true, visibleToRoles: ["student"], editableByRoles: ["student"], isActive: true });
    const rep = await saveField(db(), manager, { entity: "report", page: "profile", labelHe: "בדיווח", type: "text", required: true, visibleToRoles: ["student"], editableByRoles: ["student"], isActive: true });
    const ids = async (page?: "registration" | "profile") => (await listFields(db(), student, "student", page)).map((x) => x.id);
    expect(await ids("registration")).toContain(reg);
    expect(await ids("registration")).not.toContain(prof);
    expect(await ids("profile")).toEqual(expect.arrayContaining([prof]));
    expect(await ids("profile")).not.toContain(reg);
    // "profile" אינו דף של דיווח: חוזר לברירת המחדל של הישות
    expect((await listFields(db(), student, "report", "report_form")).map((x) => x.id)).toContain(rep);
    await expect(assertRequired(db(), student, "report", {}, "report_form")).rejects.toBeInstanceOf(CustomFieldError);
    await expect(assertRequired(db(), student, "report", { [rep]: ["כן"] }, "report_form")).resolves.toBeUndefined();
  });
});
