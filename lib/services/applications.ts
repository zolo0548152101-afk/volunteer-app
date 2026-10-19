/**
 * מועמדים מטופס ההרשמה הפתוח (/register). כל הגשה נכנסת כ"ממתין"; מנהל בודק ומאשר (עובר לתור הראיונות)
 * או דוחה (המשתמש מושבת ולא יוכל להיכנס). הסטודנט עצמו לא רואה את הסטטוס.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { studentProfiles, users } from "@/lib/db/schema";
import { assertCan, type SessionUser } from "@/lib/permissions";
import { audited } from "@/lib/services/audit";
import { NotFoundError } from "@/lib/services/users";
import type { Day } from "@/lib/services/places";

export type ApplicationStatus = "pending" | "approved" | "rejected";
export const APPLICATION_STATUSES: ApplicationStatus[] = ["pending", "approved", "rejected"];

export type Applicant = {
  id: string; firstName: string; lastName: string; email: string; phone: string | null; submittedAt: Date; status: ApplicationStatus; decidedAt: Date | null;
  nationalId: string | null; dateOfBirth: string | null; city: string | null; institution: string | null; degreeType: string | null; degreeYear: string | null; fieldOfStudy: string | null;
  preferredTypes: string[]; preferredActivities: string | null; availableDays: Day[]; availableHours: string | null; generalPreferences: string | null; studentNotes: string | null;
};

const guard = (actor: SessionUser) => assertCan(actor, "manage", "user", { organizationId: actor.organizationId });

export async function listApplications(db: Db, actor: SessionUser, status: ApplicationStatus): Promise<Applicant[]> {
  guard(actor);
  const rows = await db.select({ u: users, p: studentProfiles }).from(studentProfiles).innerJoin(users, eq(users.id, studentProfiles.userId))
    .where(and(eq(studentProfiles.organizationId, actor.organizationId), eq(studentProfiles.applicationStatus, status)))
    .orderBy(desc(users.createdAt));
  return rows.map(({ u, p }) => ({
    id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, submittedAt: u.createdAt, status: p.applicationStatus as ApplicationStatus, decidedAt: p.applicationDecidedAt,
    nationalId: p.nationalId, dateOfBirth: p.dateOfBirth, city: p.city, institution: p.institution, degreeType: p.degreeType, degreeYear: p.degreeYear, fieldOfStudy: p.fieldOfStudy,
    preferredTypes: p.preferredTypes, preferredActivities: p.preferredActivities, availableDays: p.availableDays as Day[], availableHours: p.availableHours, generalPreferences: p.generalPreferences, studentNotes: p.studentNotes,
  }));
}

export async function countApplications(db: Db, actor: SessionUser): Promise<Record<ApplicationStatus, number>> {
  guard(actor);
  const rows = await db.select({ s: studentProfiles.applicationStatus, n: sql<number>`count(*)::int` }).from(studentProfiles)
    .where(eq(studentProfiles.organizationId, actor.organizationId)).groupBy(studentProfiles.applicationStatus);
  const out = { pending: 0, approved: 0, rejected: 0 };
  for (const r of rows) if (r.s) out[r.s] = r.n;
  return out;
}

/** אישור (עובר לתור הראיונות) או דחייה (המשתמש מושבת). אפשר גם להחזיר מועמד שנדחה לאישור */
export async function decideApplication(db: Db, actor: SessionUser, userId: string, decision: "approved" | "rejected"): Promise<void> {
  guard(actor);
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ status: studentProfiles.applicationStatus, userStatus: users.status }).from(studentProfiles).innerJoin(users, eq(users.id, studentProfiles.userId))
      .where(and(eq(studentProfiles.userId, userId), eq(studentProfiles.organizationId, actor.organizationId))).for("update").limit(1);
    if (!row || !row.status) throw new NotFoundError();
    await audited(tx, { organizationId: actor.organizationId, actorId: actor.id }, { entity: "user", entityId: userId, action: decision === "approved" ? "approve_application" : "reject_application" },
      async () => ({ applicationStatus: row.status, status: row.userStatus }),
      async () => {
        await tx.update(studentProfiles).set({ applicationStatus: decision, applicationDecidedAt: new Date(), applicationDecidedBy: actor.id }).where(eq(studentProfiles.userId, userId));
        // נדחה: לא יוכל להיכנס. אושר (גם אחרי דחייה): חוזר להיות מוזמן, וקישור כניסה יישלח בסגירת הראיון
        const status = decision === "rejected" ? "inactive" : "invited";
        if (row.userStatus !== "active") await tx.update(users).set({ status }).where(eq(users.id, userId));
        return { applicationStatus: decision, status: row.userStatus !== "active" ? status : row.userStatus };
      });
  });
}
