/**
 * מטריצת ההרשאות היחידה של המערכת.
 * עיקרון: ברירת מחדל = חסימה. מה שלא הוגדר במפורש, אסור.
 * הבדיקה תמיד נעשית בשרת (server actions / route handlers), לעולם לא רק בלקוח.
 * הטבלה של סטודנט / רכז / מראיין תתמלא בשלב 2, לפי סעיף 3 ב-PRD.
 */

export const roles = ["student", "coordinator", "interviewer", "manager"] as const;
export type Role = (typeof roles)[number];

export type Action =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "approve"
  | "assign"
  | "export";

export type Entity =
  | "user"
  | "student_profile"
  | "bank_details"
  | "program"
  | "academic_year"
  | "place"
  | "time_window"
  | "interview"
  | "placement"
  | "hour_report"
  | "setting"
  | "custom_field"
  | "audit_log";

/** any = הכל בארגון · own = רשומה של המשתמש עצמו · assigned = רשומה של סטודנט שמשויך אליו כרכז */
export type Scope = "any" | "own" | "assigned";

export type Rule = { action: Action; entity: Entity; scope: Scope };

export type SessionUser = {
  id: string;
  organizationId: string;
  /** משתמש אחד יכול להחזיק כמה תפקידים (למשל רכז שהוא גם מראיין) */
  roles: Role[];
};

/** מידע על הרשומה שעליה מבקשים לפעול, לצורך scope */
export type Subject = {
  organizationId?: string;
  ownerId?: string;
  /** סטודנט יכול להיות משויך לכמה רכזים */
  coordinatorIds?: string[];
};

export type RuleTable = Record<Role, Rule[]>;

const allActions: Action[] = [
  "read",
  "create",
  "update",
  "delete",
  "approve",
  "assign",
  "export",
];

const allEntities: Entity[] = [
  "user",
  "student_profile",
  "bank_details",
  "program",
  "academic_year",
  "place",
  "time_window",
  "interview",
  "placement",
  "hour_report",
  "setting",
  "custom_field",
  "audit_log",
];

const managerRules: Rule[] = allEntities.flatMap((entity) =>
  allActions.map((action): Rule => ({ action, entity, scope: "any" })),
);

export const RULES: RuleTable = {
  student: [], // שלב 2
  coordinator: [], // שלב 2
  interviewer: [], // שלב 2
  manager: managerRules,
};

function scopeAllows(scope: Scope, user: SessionUser, subject?: Subject): boolean {
  switch (scope) {
    case "any":
      return true;
    case "own":
      return !!subject?.ownerId && subject.ownerId === user.id;
    case "assigned":
      return !!subject?.coordinatorIds?.includes(user.id);
  }
}

export function createCan(table: RuleTable) {
  return function can(
    user: SessionUser | null | undefined,
    action: Action,
    entity: Entity,
    subject?: Subject,
  ): boolean {
    if (!user) return false;
    // רשומה מארגון אחר – תמיד חסום, בלי קשר לתפקיד
    if (subject?.organizationId && subject.organizationId !== user.organizationId) {
      return false;
    }
    return user.roles.some((role) =>
      table[role]?.some(
        (rule) =>
          rule.action === action &&
          rule.entity === entity &&
          scopeAllows(rule.scope, user, subject),
      ),
    );
  };
}

export const can = createCan(RULES);

export class ForbiddenError extends Error {
  constructor(message = "forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** לשימוש ב-server actions: זורק ForbiddenError אם אין הרשאה */
export function assertCan(
  user: SessionUser | null | undefined,
  action: Action,
  entity: Entity,
  subject?: Subject,
): asserts user is SessionUser {
  if (!can(user, action, entity, subject)) throw new ForbiddenError();
}
