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

const r = (action: Action, entity: Entity, scope: Scope): Rule => ({ action, entity, scope });

/**
 * מטריצת ההרשאות לפי PRD סעיף 3. ברירת מחדל חסימה: מה שלא כתוב כאן, אסור.
 * הכללים מגדירים *מי רשאי לפעול על איזו ישות*. הגבלות ברמת שדה (רכז לא רואה ת"ז ובנק,
 * סטודנט לא רואה קיבולת ואנשי קשר במקום) נאכפות בשכבת השאילתות (lib/db/queries), לא כאן.
 * מעברי מצב של דיווח (מי רשאי לעבור לאן) נאכפים בשירות הדיווחים בשלב 6.
 */
export const RULES: RuleTable = {
  // הסטודנט רואה רק את עצמו. מקומות התנדבות בקריאה בלבד, בלי חלונות זמן (קיבולת).
  student: [
    r("read", "user", "own"),
    r("update", "user", "own"),
    r("read", "student_profile", "own"),
    r("update", "student_profile", "own"),
    r("read", "bank_details", "own"),
    r("update", "bank_details", "own"),
    r("read", "place", "any"),
    r("read", "program", "any"),
    r("read", "academic_year", "any"),
    r("read", "custom_field", "any"),
    r("read", "placement", "own"),
    r("read", "hour_report", "own"),
    r("create", "hour_report", "own"),
    r("update", "hour_report", "own"), // רק pending / needs_correction: נאכף בשירות
  ],
  // הרכז רואה ומנהל את הסטודנטים שמקושרים אליו. בלי ת"ז, בנק, ראיונות, ולוג.
  coordinator: [
    r("read", "user", "assigned"),
    r("read", "student_profile", "assigned"),
    r("read", "place", "any"),
    r("read", "time_window", "any"),
    r("read", "program", "any"),
    r("read", "academic_year", "any"),
    r("read", "custom_field", "any"),
    r("read", "placement", "assigned"),
    r("create", "placement", "assigned"), // שיבוץ מחדש של סטודנט שלו
    r("update", "placement", "assigned"),
    r("read", "hour_report", "assigned"),
    r("update", "hour_report", "assigned"), // שינוי approved_hours והערות
    r("approve", "hour_report", "assigned"),
    r("export", "hour_report", "assigned"),
  ],
  // המראיין רואה את כל הסטודנטים לצורך שיבוץ. בלי דיווחים, בנק וניהול משתמשים.
  interviewer: [
    r("read", "user", "any"),
    r("read", "student_profile", "any"),
    r("read", "place", "any"),
    r("read", "time_window", "any"),
    r("read", "program", "any"),
    r("read", "academic_year", "any"),
    r("read", "custom_field", "any"),
    r("read", "interview", "any"),
    r("create", "interview", "any"),
    r("update", "interview", "any"), // ראיון סגור לא נערך: נאכף בשירות
    r("read", "placement", "any"),
    r("create", "placement", "any"),
    r("update", "placement", "any"),
    r("assign", "user", "any"), // קישור סטודנט לרכז (רק אם עוד לא קושר: נאכף בשירות)
  ],
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
