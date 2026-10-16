/**
 * ניהול משתמשים. כל פונקציה מקבלת את המשתמש המחובר (actor), בודקת הרשאה בשרת,
 * מסננת תמיד לפי הארגון שלו, ורושמת שינויים ל-audit_log בטרנזקציה.
 * שדות רגישים (passwordHash) לעולם לא מוחזרים.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { assertCan, can, ForbiddenError, roles as ALL_ROLES, type Role, type SessionUser, type Subject } from "@/lib/permissions";
import { audited } from "@/lib/services/audit";

export class NotFoundError extends Error {
  constructor(message = "not_found") {
    super(message);
    this.name = "NotFoundError";
  }
}
export class ValidationError extends Error {
  constructor(public code: "email_taken" | "bad_roles" | "bad_coordinator" | "not_student" | "last_manager" | "self_lockout") {
    super(code);
    this.name = "ValidationError";
  }
}

const safeCols = {
  id: users.id,
  organizationId: users.organizationId,
  email: users.email,
  phone: users.phone,
  firstName: users.firstName,
  lastName: users.lastName,
  roles: users.roles,
  status: users.status,
  locale: users.locale,
  coordinatorId: users.coordinatorId,
  lastLoginAt: users.lastLoginAt,
};
export type SafeUser = {
  id: string; organizationId: string; email: string; phone: string | null; firstName: string; lastName: string;
  roles: Role[]; status: "active" | "invited" | "inactive"; locale: "he" | "en"; coordinatorId: string | null; lastLoginAt: Date | null;
};

export const subjectOf = (u: Pick<SafeUser, "id" | "organizationId" | "coordinatorId">): Subject => ({
  organizationId: u.organizationId,
  ownerId: u.id,
  coordinatorIds: u.coordinatorId ? [u.coordinatorId] : [],
});

/** מי מותר לראות ברשימה: מנהל ומראיין את כולם, רכז את הסטודנטים שלו (ואת עצמו), סטודנט את עצמו */
export async function listUsers(db: Db, actor: SessionUser, opts: { role?: Role } = {}): Promise<SafeUser[]> {
  const org = eq(users.organizationId, actor.organizationId);
  const filters = [org];
  if (opts.role) filters.push(sql`${opts.role} = ANY(${users.roles})`);
  const rows = (await db.select(safeCols).from(users).where(and(...filters)).orderBy(asc(users.firstName), asc(users.lastName))) as SafeUser[];
  // הסינון הסופי עובר דרך מנוע ההרשאות עצמו, כך שאין שני מקומות שמגדירים "מי רואה מה"
  return rows.filter((u) => u.id === actor.id || can(actor, "read", "user", subjectOf(u)));
}

export async function getUser(db: Db, actor: SessionUser, id: string): Promise<SafeUser> {
  const [u] = (await db.select(safeCols).from(users).where(and(eq(users.id, id), eq(users.organizationId, actor.organizationId))).limit(1)) as SafeUser[];
  if (!u) throw new NotFoundError();
  assertCan(actor, "read", "user", subjectOf(u));
  return u;
}

export type InviteInput = { email: string; firstName: string; lastName: string; phone?: string | null; roles: Role[]; coordinatorId?: string | null; locale?: "he" | "en" };

async function validateCoordinator(db: Db | Parameters<Parameters<Db["transaction"]>[0]>[0], organizationId: string, coordinatorId: string) {
  const [c] = await db.select({ roles: users.roles, status: users.status }).from(users)
    .where(and(eq(users.id, coordinatorId), eq(users.organizationId, organizationId))).limit(1);
  if (!c || !c.roles.includes("coordinator") || c.status === "inactive") throw new ValidationError("bad_coordinator");
}

export async function inviteUser(db: Db, actor: SessionUser, input: InviteInput): Promise<SafeUser> {
  assertCan(actor, "create", "user", { organizationId: actor.organizationId });
  if (input.roles.length === 0 || input.roles.some((r) => !ALL_ROLES.includes(r))) throw new ValidationError("bad_roles");
  const email = input.email.trim().toLowerCase();
  return db.transaction(async (tx) => {
    const [dup] = await tx.select({ id: users.id }).from(users)
      .where(and(eq(users.organizationId, actor.organizationId), sql`lower(${users.email}) = ${email}`)).limit(1);
    if (dup) throw new ValidationError("email_taken");
    if (input.coordinatorId) {
      if (!input.roles.includes("student")) throw new ValidationError("not_student");
      await validateCoordinator(tx, actor.organizationId, input.coordinatorId);
    }
    const [created] = (await tx.insert(users).values({
      organizationId: actor.organizationId, email, firstName: input.firstName.trim(), lastName: input.lastName.trim(),
      phone: input.phone ?? null, roles: input.roles, status: "invited", locale: input.locale ?? "he",
      coordinatorId: input.coordinatorId ?? null,
    }).returning(safeCols)) as SafeUser[];
    await audited(tx, { organizationId: actor.organizationId, actorId: actor.id }, { entity: "user", entityId: created.id, action: "create" },
      async () => null, async () => ({ email: created.email, roles: created.roles, coordinatorId: created.coordinatorId }));
    return created;
  });
}

async function countActiveManagers(tx: Parameters<Parameters<Db["transaction"]>[0]>[0], organizationId: string) {
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(users)
    .where(and(eq(users.organizationId, organizationId), sql`'manager' = ANY(${users.roles})`, eq(users.status, "active")));
  return n;
}

/** שינוי תפקידים (כמה תפקידים למשתמש). אי אפשר להשאיר ארגון בלי מנהל פעיל. */
export async function setRoles(db: Db, actor: SessionUser, userId: string, newRoles: Role[]): Promise<SafeUser> {
  if (newRoles.length === 0 || newRoles.some((r) => !ALL_ROLES.includes(r))) throw new ValidationError("bad_roles");
  return db.transaction(async (tx) => {
    const [target] = (await tx.select(safeCols).from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, actor.organizationId))).for("update").limit(1)) as SafeUser[];
    if (!target) throw new NotFoundError();
    assertCan(actor, "manage", "user", subjectOf(target));
    const removingManager = target.roles.includes("manager") && !newRoles.includes("manager");
    if (removingManager && target.status === "active" && (await countActiveManagers(tx, actor.organizationId)) <= 1) {
      throw new ValidationError("last_manager");
    }
    const unsetCoordinator = target.coordinatorId && !newRoles.includes("student");
    const [updated] = (await tx.update(users)
      .set({ roles: newRoles, ...(unsetCoordinator ? { coordinatorId: null } : {}) })
      .where(eq(users.id, userId)).returning(safeCols)) as SafeUser[];
    // רכז שהוסר ממנו התפקיד: הסטודנטים שלו חוזרים להיות לא משויכים
    if (target.roles.includes("coordinator") && !newRoles.includes("coordinator")) {
      await tx.update(users).set({ coordinatorId: null }).where(and(eq(users.coordinatorId, userId), eq(users.organizationId, actor.organizationId)));
    }
    await audited(tx, { organizationId: actor.organizationId, actorId: actor.id }, { entity: "user", entityId: userId, action: "update_roles" },
      async () => ({ roles: target.roles }), async () => ({ roles: updated.roles }));
    return updated;
  });
}

export async function setStatus(db: Db, actor: SessionUser, userId: string, status: "active" | "inactive"): Promise<SafeUser> {
  return db.transaction(async (tx) => {
    const [target] = (await tx.select(safeCols).from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, actor.organizationId))).for("update").limit(1)) as SafeUser[];
    if (!target) throw new NotFoundError();
    assertCan(actor, "manage", "user", subjectOf(target));
    if (status === "inactive") {
      if (target.id === actor.id) throw new ValidationError("self_lockout");
      if (target.roles.includes("manager") && target.status === "active" && (await countActiveManagers(tx, actor.organizationId)) <= 1) {
        throw new ValidationError("last_manager");
      }
    }
    const [updated] = (await tx.update(users).set({ status }).where(eq(users.id, userId)).returning(safeCols)) as SafeUser[];
    await audited(tx, { organizationId: actor.organizationId, actorId: actor.id }, { entity: "user", entityId: userId, action: status === "inactive" ? "deactivate" : "activate" },
      async () => ({ status: target.status }), async () => ({ status }));
    return updated;
  });
}

/**
 * שיוך סטודנטים לרכז (אחד לכל סטודנט, PRD 5.1). coordinatorId=null מבטל שיוך.
 * עובד גם לסטודנט בודד וגם בכמות; הכל או כלום.
 */
export async function assignCoordinator(db: Db, actor: SessionUser, studentIds: string[], coordinatorId: string | null): Promise<number> {
  const ids = [...new Set(studentIds)];
  if (ids.length === 0) return 0;
  return db.transaction(async (tx) => {
    if (coordinatorId) await validateCoordinator(tx, actor.organizationId, coordinatorId);
    const targets = (await tx.select(safeCols).from(users)
      .where(and(inArray(users.id, ids), eq(users.organizationId, actor.organizationId))).for("update")) as SafeUser[];
    if (targets.length !== ids.length) throw new NotFoundError();
    for (const t of targets) {
      assertCan(actor, "assign", "user", subjectOf(t));
      if (!t.roles.includes("student")) throw new ValidationError("not_student");
      // מראיין רק משייך סטודנט שעוד אין לו רכז. החלפה וניתוק שמורים למנהל
      if (!actor.roles.includes("manager") && (t.coordinatorId !== null || coordinatorId === null)) throw new ForbiddenError();
    }
    for (const t of targets) {
      if (t.coordinatorId === coordinatorId) continue;
      await audited(tx, { organizationId: actor.organizationId, actorId: actor.id }, { entity: "user", entityId: t.id, action: "assign_coordinator" },
        async () => ({ coordinatorId: t.coordinatorId }),
        async () => {
          await tx.update(users).set({ coordinatorId }).where(eq(users.id, t.id));
          return { coordinatorId };
        });
    }
    return targets.length;
  });
}

export { ForbiddenError };
