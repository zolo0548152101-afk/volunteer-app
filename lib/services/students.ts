/**
 * סטודנטים: הרשמה, פרופיל, ותצוגת צוות עם הגבלות שדה.
 * ת"ז וחשבון בנק: סטודנט (עצמו) ומנהל בלבד. רכז/מראיין לא רואים אותם לעולם.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { academicYears, programs, studentProfiles, users } from "@/lib/db/schema";
import { assertCan, can, type SessionUser } from "@/lib/permissions";
import { hashPassword } from "@/lib/password";
import { audited } from "@/lib/services/audit";
import { listFields, loadValues } from "@/lib/services/custom-fields";
import { NotFoundError, subjectOf } from "@/lib/services/users";
import { isValidIsraeliId, normalizeIsraeliPhone } from "@/lib/validation/israel";
import { DAYS, type Day } from "@/lib/services/places";
import { clean } from "./_util";

export class StudentError extends Error {
  constructor(public code: "email_taken" | "weak_password" | "bad_phone" | "bad_id" | "bad_name" | "bad_date" | "no_org" | "bad_bank" | "incomplete") {
    super(code);
    this.name = "StudentError";
  }
}

const DEGREE_TYPES = ["bachelor", "master", "practical_engineer", "other"] as const;
const DEGREE_YEARS = ["a", "b", "c", "d_plus"] as const;

/** הארגון שאליו נרשמים: REGISTRATION_ORG_ID, אחרת הארגון היחיד (או הוותיק ביותר) */
export async function registrationOrgId(db: Db): Promise<string> {
  const fromEnv = process.env.REGISTRATION_ORG_ID;
  if (fromEnv) return fromEnv;
  const { organizations } = await import("@/lib/db/schema");
  const [o] = await db.select({ id: organizations.id }).from(organizations).orderBy(asc(organizations.createdAt)).limit(1);
  if (!o) throw new StudentError("no_org");
  return o.id;
}

export type RegisterInput = { firstName: string; lastName: string; email: string; phone: string; password: string; locale?: "he" | "en" };

/** הרשמה עצמית: משתמש פעיל עם תפקיד סטודנט ופרופיל ריק. שנה אקדמית נוכחית ומסלול (אם יחיד) נקבעים אוטומטית. */
export async function registerStudent(db: Db, organizationId: string, input: RegisterInput): Promise<string> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) throw new StudentError("bad_name");
  if (input.password.length < 8 || input.password.length > 128) throw new StudentError("weak_password");
  const phone = normalizeIsraeliPhone(input.phone);
  if (!phone) throw new StudentError("bad_phone");
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [dup] = await tx.select({ id: users.id }).from(users)
      .where(and(eq(users.organizationId, organizationId), sql`lower(${users.email}) = ${email}`)).limit(1);
    if (dup) throw new StudentError("email_taken");
    const [u] = await tx.insert(users).values({ organizationId, email, firstName, lastName, phone, passwordHash, roles: ["student"], status: "active", locale: input.locale ?? "he" })
      .returning({ id: users.id });
    const [year] = await tx.select({ id: academicYears.id }).from(academicYears).where(and(eq(academicYears.organizationId, organizationId), eq(academicYears.isCurrent, true))).limit(1);
    const progs = await tx.select({ id: programs.id }).from(programs).where(eq(programs.organizationId, organizationId)).limit(2);
    await tx.insert(studentProfiles).values({ userId: u.id, organizationId, academicYearId: year?.id ?? null, trackId: progs.length === 1 ? progs[0].id : null });
    await audited(tx, { organizationId, actorId: u.id }, { entity: "user", entityId: u.id, action: "register" }, async () => null, async () => ({ email, roles: ["student"] }));
    return u.id;
  });
}

export type Section = "academic" | "prefs" | "bank";

export type ProfileData = {
  nationalId: string | null; dateOfBirth: string | null; city: string | null; institution: string | null; degreeType: string | null; degreeYear: string | null;
  fieldOfStudy: string | null; preferredTypes: string[]; preferredActivities: string | null; availableDays: Day[]; availableHours: string | null;
  generalPreferences: string | null; studentNotes: string | null; bankName: string | null; bankBranch: string | null; bankAccount: string | null; accountOwner: string | null;
  bankDocument: string | null; profileCompletedAt: Date | null;
  /** שדות מנהליים: קריאה בלבד לסטודנט */
  trackName: string | null; targetHours: number | null; academicYearName: string | null; coordinatorName: string | null;
};

async function loadProfile(db: Db, organizationId: string, studentId: string) {
  const [row] = await db.select({
    p: studentProfiles, trackName: programs.name, trackHours: programs.requiredHours, yearName: academicYears.name,
  }).from(studentProfiles)
    .leftJoin(programs, eq(programs.id, studentProfiles.trackId))
    .leftJoin(academicYears, eq(academicYears.id, studentProfiles.academicYearId))
    .where(and(eq(studentProfiles.userId, studentId), eq(studentProfiles.organizationId, organizationId))).limit(1);
  return row;
}

/** הפרופיל של הסטודנט עצמו (כולל ת"ז ובנק) */
export async function getMyProfile(db: Db, actor: SessionUser): Promise<ProfileData> {
  assertCan(actor, "read", "student_profile", { organizationId: actor.organizationId, ownerId: actor.id });
  const row = await loadProfile(db, actor.organizationId, actor.id);
  if (!row) throw new NotFoundError();
  const [me] = await db.select({ coordinatorId: users.coordinatorId }).from(users).where(eq(users.id, actor.id));
  let coordinatorName: string | null = null;
  if (me?.coordinatorId) {
    const [c] = await db.select({ f: users.firstName, l: users.lastName }).from(users).where(eq(users.id, me.coordinatorId));
    coordinatorName = c ? `${c.f} ${c.l}` : null;
  }
  const { p } = row;
  return {
    nationalId: p.nationalId, dateOfBirth: p.dateOfBirth, city: p.city, institution: p.institution, degreeType: p.degreeType, degreeYear: p.degreeYear,
    fieldOfStudy: p.fieldOfStudy, preferredTypes: p.preferredTypes, preferredActivities: p.preferredActivities, availableDays: p.availableDays as Day[],
    availableHours: p.availableHours, generalPreferences: p.generalPreferences, studentNotes: p.studentNotes, bankName: p.bankName, bankBranch: p.bankBranch,
    bankAccount: p.bankAccount, accountOwner: p.accountOwner, bankDocument: p.bankDocument, profileCompletedAt: p.profileCompletedAt,
    trackName: row.trackName, targetHours: p.targetHoursOverride ?? row.trackHours ?? null, academicYearName: row.yearName, coordinatorName,
  };
}

/** תאריך YYYY-MM-DD תקין, בעבר, גיל סביר */
function validBirthDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return false;
  const year = new Date(t).getUTCFullYear();
  return t < Date.now() && year > 1930;
}

const digitsOnly = (v: string) => v.replace(/[\s-]/g, "");

type Patch = Partial<typeof studentProfiles.$inferInsert>;

/** בונה את העדכון לחלק בפרופיל. `sensitive` = מותר לגעת בת"ז (סטודנט עצמו או מנהל); בלעדיו שדה ת"ז נשאר כמות שהוא */
function buildPatch(section: Section, data: Record<string, string | string[]>, sensitive: boolean): Patch {
  const str = (k: string) => clean(typeof data[k] === "string" ? (data[k] as string) : null);
  const arr = (k: string) => (Array.isArray(data[k]) ? (data[k] as string[]) : typeof data[k] === "string" && data[k] ? [data[k] as string] : []);
  if (section === "academic") {
    const dob = str("dateOfBirth");
    if (dob && !validBirthDate(dob)) throw new StudentError("bad_date");
    const dt = str("degreeType"), dy = str("degreeYear");
    const set: Patch = {
      dateOfBirth: dob, city: str("city"), institution: str("institution"),
      degreeType: dt && (DEGREE_TYPES as readonly string[]).includes(dt) ? (dt as (typeof DEGREE_TYPES)[number]) : null,
      degreeYear: dy && (DEGREE_YEARS as readonly string[]).includes(dy) ? (dy as (typeof DEGREE_YEARS)[number]) : null,
      fieldOfStudy: str("fieldOfStudy"),
    };
    if (sensitive) {
      const nid = str("nationalId");
      if (nid && !isValidIsraeliId(nid)) throw new StudentError("bad_id");
      set.nationalId = nid ? nid.padStart(9, "0") : null;
    }
    return set;
  }
  if (section === "prefs") {
    return {
      preferredTypes: arr("preferredTypes"), preferredActivities: str("preferredActivities"),
      availableDays: arr("availableDays").filter((d): d is Day => (DAYS as string[]).includes(d)),
      availableHours: str("availableHours"), generalPreferences: str("generalPreferences"), studentNotes: str("studentNotes"),
    };
  }
  const account = str("bankAccount"), branch = str("bankBranch");
  if ((account && !/^\d{4,12}$/.test(digitsOnly(account))) || (branch && !/^\d{1,4}$/.test(digitsOnly(branch)))) throw new StudentError("bad_bank");
  return { bankName: str("bankName"), bankBranch: branch ? digitsOnly(branch) : null, bankAccount: account ? digitsOnly(account) : null, accountOwner: str("accountOwner") };
}

async function applyPatch(db: Db, actor: SessionUser, studentId: string, section: Section, set: Patch, action: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ p: studentProfiles }).from(studentProfiles)
      .where(and(eq(studentProfiles.userId, studentId), eq(studentProfiles.organizationId, actor.organizationId))).for("update");
    if (!before) throw new NotFoundError();
    await audited(tx, { organizationId: actor.organizationId, actorId: actor.id }, { entity: "student_profile", entityId: studentId, action },
      // בנק ות"ז: ברישום רק *אילו* שדות השתנו, לא הערכים
      async () => (section === "prefs" ? { ...pick(before.p, Object.keys(set)) } : { changed: Object.keys(set) }),
      async () => {
        await tx.update(studentProfiles).set(set).where(eq(studentProfiles.userId, studentId));
        return section === "prefs" ? set : { changed: Object.keys(set) };
      });
  });
}

/** שומר חלק מהפרופיל. הסטודנט עורך רק שדות מותרים: מסלול, יעד ושנה לא בידיו. */
export async function saveSection(db: Db, actor: SessionUser, section: Section, data: Record<string, string | string[]>): Promise<void> {
  const subject = { organizationId: actor.organizationId, ownerId: actor.id };
  assertCan(actor, "update", section === "bank" ? "bank_details" : "student_profile", subject);
  await applyPatch(db, actor, actor.id, section, buildPatch(section, data, true), `update_${section}`);
}

/**
 * עריכת פרטי סטודנט על ידי צוות (מנהל: כל הסטודנטים; רכז: שלו; מראיין: כולם).
 * רק פרטים אקדמיים והעדפות. ת"ז נוגעים בה רק מי שרשאי לבנק (מנהל); בנק לא נערך כאן לעולם.
 */
export async function saveStudentByStaff(db: Db, actor: SessionUser, studentId: string, section: "academic" | "prefs", data: Record<string, string | string[]>): Promise<void> {
  const [u] = await db.select().from(users).where(and(eq(users.id, studentId), eq(users.organizationId, actor.organizationId))).limit(1);
  if (!u || !u.roles.includes("student")) throw new NotFoundError();
  const subject = subjectOf(u);
  assertCan(actor, "update", "student_profile", subject);
  const sensitive = can(actor, "update", "bank_details", subject);
  await applyPatch(db, actor, studentId, section, buildPatch(section, data, sensitive), `staff_update_${section}`);
}

const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, o[k]]));

/** סיום הרשמה: נכנס לתור "ממתינים לראיון". דורש לפחות ת"ז, מוסד ותואר. */
export async function completeProfile(db: Db, actor: SessionUser): Promise<void> {
  assertCan(actor, "update", "student_profile", { organizationId: actor.organizationId, ownerId: actor.id });
  const p = await getMyProfile(db, actor);
  if (!p.nationalId || !p.institution || !p.degreeType) throw new StudentError("incomplete");
  // שדות מותאמים שסומנו חובה: אי אפשר לעקוף אותם בהשמטה מהטופס
  const required = (await listFields(db, actor, "student", "registration")).filter((f) => f.required && f.canEdit && f.type !== "boolean");
  if (required.length > 0) {
    const values = await loadValues(db, actor.organizationId, actor.id, required);
    const missing = required.some((f) => { const v = values[f.id]; return v === null || v === "" || (Array.isArray(v) && v.length === 0); });
    if (missing) throw new StudentError("incomplete");
  }
  await db.update(studentProfiles).set({ profileCompletedAt: p.profileCompletedAt ?? new Date() }).where(eq(studentProfiles.userId, actor.id));
}

/* ───────────── תצוגת צוות ───────────── */

export type StaffStudentView = Omit<ProfileData, "nationalId" | "bankName" | "bankBranch" | "bankAccount" | "accountOwner" | "bankDocument"> &
  Partial<Pick<ProfileData, "nationalId" | "bankName" | "bankBranch" | "bankAccount" | "accountOwner" | "bankDocument">> & {
    id: string; firstName: string; lastName: string; email: string; phone: string | null; coordinatorId: string | null; registeredAt: Date;
  };

/**
 * פרופיל סטודנט לצוות. מנהל: הכל. רכז (רק שלו) ומראיין: בלי ת"ז ובנק.
 * ההסרה היא בשכבת השאילתה כאן, לא ב-UI.
 */
export async function getStudentForStaff(db: Db, actor: SessionUser, studentId: string): Promise<StaffStudentView> {
  const [u] = await db.select().from(users).where(and(eq(users.id, studentId), eq(users.organizationId, actor.organizationId))).limit(1);
  if (!u || !u.roles.includes("student")) throw new NotFoundError();
  assertCan(actor, "read", "student_profile", subjectOf(u));
  const row = await loadProfile(db, actor.organizationId, studentId);
  if (!row) throw new NotFoundError();
  const [coord] = u.coordinatorId ? await db.select({ f: users.firstName, l: users.lastName }).from(users).where(eq(users.id, u.coordinatorId)) : [];
  const { p } = row;
  const sensitive = can(actor, "read", "bank_details", subjectOf(u));
  return {
    id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, coordinatorId: u.coordinatorId, registeredAt: u.createdAt,
    dateOfBirth: p.dateOfBirth, city: p.city, institution: p.institution, degreeType: p.degreeType, degreeYear: p.degreeYear, fieldOfStudy: p.fieldOfStudy,
    preferredTypes: p.preferredTypes, preferredActivities: p.preferredActivities, availableDays: p.availableDays as Day[], availableHours: p.availableHours,
    generalPreferences: p.generalPreferences, studentNotes: p.studentNotes, profileCompletedAt: p.profileCompletedAt,
    trackName: row.trackName, targetHours: p.targetHoursOverride ?? row.trackHours ?? null, academicYearName: row.yearName, coordinatorName: coord ? `${coord.f} ${coord.l}` : null,
    ...(sensitive ? { nationalId: p.nationalId, bankName: p.bankName, bankBranch: p.bankBranch, bankAccount: p.bankAccount, accountOwner: p.accountOwner, bankDocument: p.bankDocument } : {}),
  };
}

/** סטודנטים שסיימו הרשמה וממתינים לראיון (אין להם עדיין שיבוץ פעיל או ראיון שנסגר), לפי תאריך הרשמה */
export async function listAwaitingInterview(db: Db, actor: SessionUser) {
  assertCan(actor, "read", "interview", { organizationId: actor.organizationId });
  const res = await db.execute<{ id: string; first_name: string; last_name: string; city: string | null; registered_at: Date }>(sql`
    SELECT u.id, u.first_name, u.last_name, sp.city, u.created_at AS registered_at
    FROM users u JOIN student_profiles sp ON sp.user_id = u.id
    WHERE u.organization_id = ${actor.organizationId} AND u.status = 'active' AND sp.profile_completed_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM interviews i WHERE i.student_id = u.id AND i.status = 'finalized' AND i.kind = 'interview')
    ORDER BY u.created_at ASC`);
  return res.rows.map((r) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, city: r.city, registeredAt: new Date(r.registered_at) }));
}

