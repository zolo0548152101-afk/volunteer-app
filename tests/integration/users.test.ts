import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import { auditLog, users } from "@/lib/db/schema";
import { deleteOrganization, seedDemo } from "@/lib/db/seed";
import { ForbiddenError, type Role, type SessionUser } from "@/lib/permissions";
import { resolveLogin, setPasswordFromToken } from "@/lib/services/credentials";
import { hashPassword } from "@/lib/password";
import { DEMO_EMAILS, DEMO_PASSWORD } from "@/lib/db/seed";
import { issueToken } from "@/lib/services/tokens";
import { assignCoordinator, getUser, inviteUser, listUsers, NotFoundError, setRoles, setStatus, ValidationError } from "@/lib/services/users";

type Seed = Awaited<ReturnType<typeof seedDemo>>;
let s: Seed;
let other: Seed;
const act = (u: { id: string }, org: string, roles: Role[]): SessionUser => ({ id: u.id, organizationId: org, roles });
let manager: SessionUser, c1: SessionUser, c2: SessionUser, interviewer: SessionUser, st1: SessionUser, st3: SessionUser;

beforeAll(async () => {
  s = await seedDemo(db(), { orgName: `משתמשים ${Date.now()}` });
  other = await seedDemo(db(), { orgName: `ארגון אחר ${Date.now()}` });
  manager = act(s.manager, s.organizationId, ["manager"]);
  c1 = act(s.coordinators[0], s.organizationId, ["coordinator"]);
  c2 = act(s.coordinators[1], s.organizationId, ["coordinator"]);
  interviewer = act(s.interviewer, s.organizationId, ["interviewer"]);
  st1 = act(s.students[0], s.organizationId, ["student"]);
  st3 = act(s.students[2], s.organizationId, ["student"]);
});
afterAll(async () => {
  if (s) await deleteOrganization(db(), s.organizationId);
  if (other) await deleteOrganization(db(), other.organizationId);
  await closeDb();
});


describe("גישה לנתונים לפי תפקיד", () => {
  it("מנהל ומראיין רואים את כל משתמשי הארגון, ולא של ארגון אחר", async () => {
    expect(await listUsers(db(), manager)).toHaveLength(10);
    expect(await listUsers(db(), interviewer)).toHaveLength(10);
  });

  it("רכז רואה רק את הסטודנטים המשויכים אליו (ואת עצמו)", async () => {
    const l1 = await listUsers(db(), c1);
    expect(l1.filter((u) => u.roles.includes("student")).map((u) => u.id).sort())
      .toEqual([s.students[0].id, s.students[1].id].sort());
    expect(l1.some((u) => u.id === c1.id)).toBe(true);
    expect(l1.some((u) => u.id === s.students[2].id)).toBe(false);
  });

  it("סטודנט רואה רק את עצמו", async () => {
    expect((await listUsers(db(), st1)).map((u) => u.id)).toEqual([st1.id]);
  });

  it("לא מוחזר passwordHash אף פעם", async () => {
    const rows = await listUsers(db(), manager);
    for (const r of rows) expect(Object.keys(r)).not.toContain("passwordHash");
  });

  it("getUser: רשומה זרה = 403, לא קיימת/ארגון אחר = 404", async () => {
    await expect(getUser(db(), c1, s.students[2].id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getUser(db(), st1, s.students[1].id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getUser(db(), c1, s.students[0].id)).resolves.toMatchObject({ id: s.students[0].id });
    await expect(getUser(db(), manager, other.students[0].id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("משתמש עם מזהה ארגון מזויף לא רואה כלום מארגון אחר", async () => {
    expect(await listUsers(db(), { ...manager, organizationId: other.organizationId })).toHaveLength(10);
    const rows = await listUsers(db(), { ...manager, organizationId: other.organizationId });
    expect(rows.every((r) => r.organizationId === other.organizationId)).toBe(true);
  });
});

describe("ניהול משתמשים (מנהל בלבד)", () => {
  it("רק מנהל מזמין; אחרים נחסמים", async () => {
    const input = { email: "x@t.test", firstName: "א", lastName: "ב", roles: ["student"] as Role[] };
    for (const a of [c1, interviewer, st1]) await expect(inviteUser(db(), a, input)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("הזמנה יוצרת משתמש במצב 'הוזמן', מנרמלת מייל, כותבת לוג, וחוסמת כפילות", async () => {
    const u = await inviteUser(db(), manager, { email: "New.Student@T.test", firstName: "נועה", lastName: "כהן", roles: ["student"], coordinatorId: c2.id });
    expect(u).toMatchObject({ email: "new.student@t.test", status: "invited", coordinatorId: c2.id });
    const log = await db().select().from(auditLog).where(eq(auditLog.entityId, u.id));
    expect(log.map((l) => l.action)).toContain("create");
    await expect(inviteUser(db(), manager, { email: "NEW.student@t.test", firstName: "ד", lastName: "ה", roles: ["student"] }))
      .rejects.toMatchObject({ code: "email_taken" });
  });

  it("רכז לא תקף (סטודנט / ארגון אחר) נדחה", async () => {
    await expect(inviteUser(db(), manager, { email: "a1@t.test", firstName: "א", lastName: "ב", roles: ["student"], coordinatorId: st1.id }))
      .rejects.toMatchObject({ code: "bad_coordinator" });
    await expect(inviteUser(db(), manager, { email: "a2@t.test", firstName: "א", lastName: "ב", roles: ["student"], coordinatorId: other.coordinators[0].id }))
      .rejects.toMatchObject({ code: "bad_coordinator" });
  });

  it("שינוי כמה תפקידים: מוסיף מראיין לרכז, נרשם בלוג", async () => {
    const u = await setRoles(db(), manager, c1.id, ["coordinator", "interviewer"]);
    expect(u.roles.sort()).toEqual(["coordinator", "interviewer"]);
    const log = await db().select().from(auditLog).where(eq(auditLog.entityId, c1.id));
    const l = log.find((x) => x.action === "update_roles")!;
    expect(l.oldValue).toEqual({ roles: ["coordinator"] });
    await setRoles(db(), manager, c1.id, ["coordinator"]);
  });

  it("אי אפשר להשאיר ארגון בלי מנהל פעיל", async () => {
    await expect(setRoles(db(), manager, manager.id, ["coordinator"])).rejects.toMatchObject({ code: "last_manager" });
    await expect(setStatus(db(), manager, manager.id, "inactive")).rejects.toMatchObject({ code: "self_lockout" });
  });

  it("הסרת תפקיד רכז מנתקת ממנו את הסטודנטים", async () => {
    const temp = await inviteUser(db(), manager, { email: "tc@t.test", firstName: "ר", lastName: "כ", roles: ["coordinator"] });
    await assignCoordinator(db(), manager, [s.students[4].id], temp.id);
    await setRoles(db(), manager, temp.id, ["interviewer"]);
    const [st] = await db().select().from(users).where(eq(users.id, s.students[4].id));
    expect(st.coordinatorId).toBeNull();
  });
});

describe("שיוך סטודנט לרכז", () => {
  it("בודד ובכמות, והכל או כלום", async () => {
    expect(await assignCoordinator(db(), manager, [s.students[4].id, s.students[5].id], c1.id)).toBe(2);
    const rows = await db().select().from(users).where(eq(users.coordinatorId, c1.id));
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining([s.students[4].id, s.students[5].id]));
    // אחד מהם לא סטודנט: שום שינוי לא נשמר
    await expect(assignCoordinator(db(), manager, [s.students[4].id, c2.id], c2.id)).rejects.toBeInstanceOf(ValidationError);
    const [still] = await db().select().from(users).where(eq(users.id, s.students[4].id));
    expect(still.coordinatorId).toBe(c1.id);
    await assignCoordinator(db(), manager, [s.students[4].id, s.students[5].id], null);
  });

  it("רכז וסטודנט לא יכולים לשייך; מראיין כן (לפי מטריצת ההרשאות)", async () => {
    await expect(assignCoordinator(db(), c1, [s.students[0].id], c2.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assignCoordinator(db(), st3, [st3.id], c1.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assignCoordinator(db(), interviewer, [s.students[5].id], c2.id)).resolves.toBe(1);
  });

  it("מראיין לא מחליף ולא מנתק רכז של סטודנט שכבר משויך (ביקורת Fable)", async () => {
    // students[5] שויך לעיל ל-c2
    await expect(assignCoordinator(db(), interviewer, [s.students[5].id], c1.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assignCoordinator(db(), interviewer, [s.students[5].id], null)).rejects.toBeInstanceOf(ForbiddenError);
    const [row] = await db().select().from(users).where(eq(users.id, s.students[5].id));
    expect(row.coordinatorId).toBe(c2.id);
    // מנהל כן רשאי
    await expect(assignCoordinator(db(), manager, [s.students[5].id], c1.id)).resolves.toBe(1);
  });

  it("סטודנט מארגון אחר: לא נמצא", async () => {
    await expect(assignCoordinator(db(), manager, [other.students[0].id], c1.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("שיוך נרשם בלוג עם הערך הקודם", async () => {
    const log = await db().select().from(auditLog).where(eq(auditLog.entityId, s.students[5].id));
    expect(log.some((l) => l.action === "assign_coordinator")).toBe(true);
  });
});

describe("הסלמת הרשאות ושימור חשבונות (ביקורת Fable)", () => {
  it("אף אחד חוץ ממנהל לא משנה תפקידים או סטטוס, גם לא של עצמו", async () => {
    for (const a of [st1, c1, interviewer]) {
      await expect(setRoles(db(), a, a.id, [...a.roles, "manager"])).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setStatus(db(), a, a.id, "active")).rejects.toBeInstanceOf(ForbiddenError);
    }
    const [row] = await db().select().from(users).where(eq(users.id, st1.id));
    expect(row.roles).toEqual(["student"]);
  });

  it("קישור איפוס ישן לא מחזיר לחיים משתמש מושבת, והטוקן לא נצרך", async () => {
    const victim = s.students[3];
    const raw = await issueToken(db(), { organizationId: s.organizationId, userId: victim.id, kind: "password_reset" });
    await setStatus(db(), manager, victim.id, "inactive");
    await expect(setPasswordFromToken(db(), { kind: "password_reset", raw, passwordHash: "x" })).rejects.toThrow();
    const [row] = await db().select().from(users).where(eq(users.id, victim.id));
    expect(row.status).toBe("inactive");
    expect(row.passwordHash).not.toBe("x");
    // אחרי הפעלה מחדש אותו קישור עדיין עובד (לא נצרך)
    await setStatus(db(), manager, victim.id, "active");
    expect(await setPasswordFromToken(db(), { kind: "password_reset", raw, passwordHash: "new-hash" })).toBe(true);
  });

  it("הזמנה מפעילה משתמש 'הוזמן'", async () => {
    const u = await inviteUser(db(), manager, { email: "inv2@t.test", firstName: "א", lastName: "ב", roles: ["student"] });
    const raw = await issueToken(db(), { organizationId: s.organizationId, userId: u.id, kind: "invite" });
    expect(await setPasswordFromToken(db(), { kind: "invite", raw, passwordHash: "h" })).toBe(true);
    const [row] = await db().select().from(users).where(eq(users.id, u.id));
    expect(row.status).toBe("active");
  });
});

describe("כניסה כשאותו מייל קיים בכמה ארגונים (ביקורת Fable)", () => {
  it("הסיסמה מכריעה מי נכנס, וסיסמה שגויה לא נכנסת לאף חשבון", async () => {
    // other הוא ארגון שני עם אותם מיילי דמו. מחליפים את הסיסמה של המנהל שלו
    await db().update(users).set({ passwordHash: await hashPassword("other-pass-9") }).where(eq(users.id, other.manager.id));
    const mine = await resolveLogin(db(), DEMO_EMAILS.manager.toUpperCase(), DEMO_PASSWORD);
    const theirs = await resolveLogin(db(), DEMO_EMAILS.manager, "other-pass-9");
    expect(mine?.organizationId).toBeDefined();
    expect(theirs?.id).toBe(other.manager.id);
    expect(mine?.id).not.toBe(theirs?.id);
    expect(await resolveLogin(db(), DEMO_EMAILS.manager, "wrong")).toBeNull();
    expect(await resolveLogin(db(), "nobody@nowhere.test", "x")).toBeNull();
  });
});
