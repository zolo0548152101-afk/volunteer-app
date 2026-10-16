import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import { auditLog, customFields, studentProfiles, users } from "@/lib/db/schema";
import { deleteOrganization, seedDemo } from "@/lib/db/seed";
import { ForbiddenError, type Role, type SessionUser } from "@/lib/permissions";
import { CustomFieldError, listFields, loadValues, saveValues } from "@/lib/services/custom-fields";
import { completeProfile, getMyProfile, getStudentForStaff, listAwaitingInterview, registerStudent, saveSection, StudentError } from "@/lib/services/students";
import { verifyPassword } from "@/lib/password";

type Seed = Awaited<ReturnType<typeof seedDemo>>;
let s: Seed;
const act = (u: { id: string }, org: string, roles: Role[]): SessionUser => ({ id: u.id, organizationId: org, roles });
let manager: SessionUser, c1: SessionUser, c2: SessionUser, interviewer: SessionUser, st1: SessionUser;

beforeAll(async () => {
  s = await seedDemo(db(), { orgName: `סטודנטים ${Date.now()}` });
  manager = act(s.manager, s.organizationId, ["manager"]);
  c1 = act(s.coordinators[0], s.organizationId, ["coordinator"]);
  c2 = act(s.coordinators[1], s.organizationId, ["coordinator"]);
  interviewer = act(s.interviewer, s.organizationId, ["interviewer"]);
  st1 = act(s.students[0], s.organizationId, ["student"]);
});
afterAll(async () => {
  if (s) await deleteOrganization(db(), s.organizationId);
  await closeDb();
});

const reg = (over: Partial<Parameters<typeof registerStudent>[2]> = {}) =>
  registerStudent(db(), s.organizationId, { firstName: "נועה", lastName: "כהן", email: `noa${Math.random().toString(36).slice(2)}@t.test`, phone: "050-123-4567", password: "longenough1", ...over });

describe("הרשמה עצמית", () => {
  it("יוצר סטודנט פעיל עם פרופיל, שנה נוכחית ומסלול (יחיד), סיסמה מגובבת", async () => {
    const id = await reg();
    const [u] = await db().select().from(users).where(eq(users.id, id));
    expect(u).toMatchObject({ roles: ["student"], status: "active", phone: "0501234567" });
    expect(u.passwordHash).toMatch(/^scrypt\$/);
    expect(await verifyPassword("longenough1", u.passwordHash!)).toBe(true);
    const [p] = await db().select().from(studentProfiles).where(eq(studentProfiles.userId, id));
    expect(p.academicYearId).toBe(s.yearId);
    expect(p.trackId).toBe(s.programId);
    expect(p.profileCompletedAt).toBeNull();
  });

  it("דחיות: מייל כפול (גם באותיות אחרות), סיסמה קצרה, טלפון, שם", async () => {
    const email = `dup${Date.now()}@t.test`;
    await reg({ email });
    await expect(reg({ email: email.toUpperCase() })).rejects.toMatchObject({ code: "email_taken" });
    await expect(reg({ password: "short" })).rejects.toMatchObject({ code: "weak_password" });
    await expect(reg({ phone: "123" })).rejects.toMatchObject({ code: "bad_phone" });
    await expect(reg({ firstName: " " })).rejects.toMatchObject({ code: "bad_name" });
  });
});

describe("פרופיל ושלבי הרשמה", () => {
  let me: SessionUser;
  beforeAll(async () => { me = act({ id: await reg() }, s.organizationId, ["student"]); });

  it("ולידציה: ת״ז, תאריך, בנק", async () => {
    await expect(saveSection(db(), me, "academic", { nationalId: "123456789" })).rejects.toMatchObject({ code: "bad_id" });
    await expect(saveSection(db(), me, "academic", { nationalId: "123456782", dateOfBirth: "2999-01-01" })).rejects.toMatchObject({ code: "bad_date" });
    await expect(saveSection(db(), me, "bank", { bankAccount: "12ab" })).rejects.toMatchObject({ code: "bad_bank" });
  });

  it("שמירת חלקים; לא ניתן להשלים בלי שדות חובה", async () => {
    await expect(completeProfile(db(), me)).rejects.toBeInstanceOf(StudentError);
    await saveSection(db(), me, "academic", { nationalId: "123456782", institution: "אוניברסיטת חיפה", degreeType: "bachelor", degreeYear: "b", city: "חיפה" });
    await saveSection(db(), me, "prefs", { preferredTypes: ["elders"], availableDays: ["sun", "tue", "xxx"], availableHours: "8-14" });
    await saveSection(db(), me, "bank", { bankName: "לאומי", bankBranch: "123", bankAccount: "12-345-678", accountOwner: "נועה כהן" });
    const p = await getMyProfile(db(), me);
    expect(p).toMatchObject({ nationalId: "123456782", degreeType: "bachelor", availableDays: ["sun", "tue"], bankAccount: "12345678", targetHours: 140, profileCompletedAt: null });
    await completeProfile(db(), me);
    expect((await getMyProfile(db(), me)).profileCompletedAt).not.toBeNull();
  });

  it("הסטודנט לא יכול לשנות מסלול/יעד/שנה (אין שדה כזה בשמירה)", async () => {
    await saveSection(db(), me, "academic", { nationalId: "123456782", institution: "x", degreeType: "bachelor", trackId: "evil", targetHoursOverride: "1" } as never);
    const [p] = await db().select().from(studentProfiles).where(eq(studentProfiles.userId, me.id));
    expect(p.trackId).toBe(s.programId);
    expect(p.targetHoursOverride).toBeNull();
  });

  it("ביומן: ת״ז ובנק נרשמים כשמות שדות בלבד, לא כערכים", async () => {
    const logs = await db().select().from(auditLog).where(eq(auditLog.entityId, me.id));
    const text = JSON.stringify(logs);
    expect(text).not.toContain("123456782");
    expect(text).not.toContain("12345678");
    expect(logs.some((l) => l.action === "update_bank")).toBe(true);
  });

  it("מופיע בתור הממתינים לראיון, לפי תאריך הרשמה", async () => {
    const q = await listAwaitingInterview(db(), interviewer);
    expect(q.some((x) => x.id === me.id)).toBe(true);
    const times = q.map((x) => x.registeredAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    await expect(listAwaitingInterview(db(), c1)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("הגבלות שדה לצוות", () => {
  it("מנהל רואה ת״ז ובנק; מראיין ורכז לא (השדות לא קיימים בתשובה)", async () => {
    await saveSection(db(), st1, "academic", { nationalId: "123456782" });
    await saveSection(db(), st1, "bank", { bankAccount: "9876543" });
    const m = await getStudentForStaff(db(), manager, st1.id);
    expect(m.nationalId).toBeTruthy();
    expect(m.bankAccount).toBeTruthy();
    for (const a of [interviewer, c1]) {
      const v = await getStudentForStaff(db(), a, st1.id);
      for (const k of ["nationalId", "bankName", "bankBranch", "bankAccount", "accountOwner", "bankDocument"]) expect(Object.keys(v)).not.toContain(k);
      expect(v.firstName).toBeTruthy();
    }
  });

  it("רכז לא רואה סטודנט של רכז אחר; סטודנט לא רואה אחרים דרך תצוגת הצוות", async () => {
    await expect(getStudentForStaff(db(), c2, st1.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getStudentForStaff(db(), st1, s.students[1].id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getStudentForStaff(db(), c1, s.coordinators[1].id)).rejects.toThrow();
  });
});

describe("שדות מותאמים", () => {
  let fStudent: string, fManager: string, fReq: string;
  beforeAll(async () => {
    const mk = async (key: string, over: Partial<typeof customFields.$inferInsert>) =>
      (await db().insert(customFields).values({ organizationId: s.organizationId, entity: "student", key, labelHe: key, type: "text", ...over }).returning({ id: customFields.id }))[0].id;
    fStudent = await mk("shirt", { type: "select", options: [{ key: "m", label_he: "M" }, { key: "l", label_he: "L" }], visibleToRoles: ["student", "manager"], editableByRoles: ["student", "manager"] });
    fManager = await mk("internal", { visibleToRoles: ["manager"], editableByRoles: ["manager"] });
    fReq = await mk("must", { type: "number", required: true, visibleToRoles: ["student", "manager"], editableByRoles: ["student", "manager"] });
  });

  it("סטודנט רואה רק שדות שהוגדרו לו; שדה מנהלי נסתר", async () => {
    const keys = (await listFields(db(), st1, "student")).map((f) => f.key);
    expect(keys).toContain("shirt");
    expect(keys).not.toContain("internal");
    expect((await listFields(db(), manager, "student")).map((f) => f.key)).toContain("internal");
  });

  it("שמירה: רק שדות עריכים; שדה מנהלי שנשלח מסטודנט מתעלמים ממנו", async () => {
    await saveValues(db(), st1, "student", st1.id, { [fStudent]: ["l"], [fManager]: ["hacked"], [fReq]: ["3"] });
    const vals = await loadValues(db(), s.organizationId, st1.id, await listFields(db(), manager, "student"));
    expect(vals[fStudent]).toBe("l");
    expect(vals[fManager]).toBeNull();
    expect(vals[fReq]).toBe(3);
  });

  it("ערך לא חוקי / חובה חסרה נדחים", async () => {
    await expect(saveValues(db(), st1, "student", st1.id, { [fStudent]: ["xl"] })).rejects.toBeInstanceOf(CustomFieldError);
    await expect(saveValues(db(), st1, "student", st1.id, { [fReq]: ["abc"] })).rejects.toMatchObject({ code: "invalid" });
    await expect(saveValues(db(), st1, "student", st1.id, { [fReq]: [""] }, { enforceRequired: true })).rejects.toMatchObject({ code: "required" });
  });

  it("סיום הרשמה נחסם כשחסר שדה מותאם חובה, גם אם הוא הושמט מהטופס (ביקורת Fable)", async () => {
    const me = act({ id: await reg() }, s.organizationId, ["student"]);
    await saveSection(db(), me, "academic", { nationalId: "123456782", institution: "אוניברסיטת חיפה", degreeType: "bachelor", degreeYear: "b", city: "חיפה" });
    await expect(completeProfile(db(), me)).rejects.toMatchObject({ code: "incomplete" }); // "must" חובה וריק
    await saveValues(db(), me, "student", me.id, { [fReq]: ["5"] });
    await expect(completeProfile(db(), me)).resolves.toBeUndefined();
  });

  it("עדכון חוזר דורס ולא יוצר כפילות", async () => {
    await saveValues(db(), st1, "student", st1.id, { [fStudent]: ["m"] });
    const vals = await loadValues(db(), s.organizationId, st1.id, await listFields(db(), st1, "student"));
    expect(vals[fStudent]).toBe("m");
  });
});
