/**
 * סכמת מסד הנתונים. מקור: PRD סעיף 5 (+ סעיפים 3 ו-7 במקומות שהם מוסיפים עמודות).
 *
 * עקרונות:
 *  - organization_id בכל טבלה מהיום הראשון.
 *  - קיבולת (תפוסה, יתרה, שעות מאושרות) לעולם לא נשמרת כעמודה. היא מחושבת
 *    משיבוצים פעילים: lib/services/capacity.ts + lib/db/queries/capacity.ts.
 *  - היסטוריה נשמרת: שיבוצים וראיונות לא נמחקים, `is_active` / `status` מסמנים.
 *  - `reported_hours` לא נדרס אף פעם; הרכז משנה `approved_hours` בלבד.
 *  - שמות העמודות באנגלית הם שמות טכניים בלבד. התצוגה למשתמש בעברית (messages/*.json).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* ───────────── Enums ───────────── */

export const roleEnum = pgEnum("role", ["student", "coordinator", "interviewer", "manager"]);
export const userStatusEnum = pgEnum("user_status", ["active", "invited", "inactive"]);
export const localeEnum = pgEnum("locale", ["he", "en"]);
/** א' עד ו'. הערכים טכניים; התצוגה בעברית מ-i18n */
export const dayEnum = pgEnum("day", ["sun", "mon", "tue", "wed", "thu", "fri"]);
export const degreeTypeEnum = pgEnum("degree_type", ["bachelor", "master", "practical_engineer", "other"]);
export const degreeYearEnum = pgEnum("degree_year", ["a", "b", "c", "d_plus"]);
export const placeStatusEnum = pgEnum("place_status", ["active", "paused", "closed"]);
export const interviewKindEnum = pgEnum("interview_kind", ["interview", "reassignment"]);
export const interviewStatusEnum = pgEnum("interview_status", ["draft", "finalized", "cancelled"]);
export const impressionEnum = pgEnum("general_impression", [
  "very_suitable",
  "suitable",
  "conditionally_suitable",
  "not_suitable",
]);
export const reportTypeEnum = pgEnum("report_type", ["volunteering", "absence"]);
export const reportStatusEnum = pgEnum("report_status", [
  "pending",
  "approved",
  "rejected",
  "needs_correction",
]);
export const absenceReasonEnum = pgEnum("absence_reason", ["reserve_duty", "illness", "security_situation", "other"]);
export const customEntityEnum = pgEnum("custom_entity", ["student", "place", "placement", "report"]);
export const customFieldTypeEnum = pgEnum("custom_field_type", [
  "text",
  "number",
  "date",
  "select",
  "multi_select",
  "file",
  "boolean",
]);
export const channelEnum = pgEnum("channel", ["email", "sms", "whatsapp"]);

/* ───────────── עזרים ───────────── */

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
/** שעות / תקנים: עשרוני בשתי ספרות (0.25, 0.5, 1.5 …), מוחזר כ-number */
const hours = (name: string) => numeric(name, { precision: 7, scale: 2, mode: "number" });

/* ───────────── ארגון ───────────── */

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

/* ───────────── 5.1 משתמשים ───────────── */

export const users = pgTable(
  "users",
  {
    id: id(),
    organizationId: orgId(),
    email: text("email").notNull(),
    /** hash בלבד; null למוזמן שעוד לא הגדיר סיסמה */
    passwordHash: text("password_hash"),
    phone: text("phone"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    roles: roleEnum("roles").array().notNull().default(sql`ARRAY[]::role[]`),
    status: userStatusEnum("status").notNull().default("invited"),
    locale: localeEnum("locale").notNull().default("he"),
    /** לסטודנט: הרכז שלו (אחד) */
    coordinatorId: uuid("coordinator_id").references((): AnyPgColumn => users.id),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_org_email_uq").on(t.organizationId, sql`lower(${t.email})`),
    index("users_org_idx").on(t.organizationId),
    index("users_coordinator_idx").on(t.coordinatorId),
  ],
);

/* ───────────── 5.3 תוכניות / מסלולים ───────────── */

export const programs = pgTable(
  "programs",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    /** יעד שעות לשנה אקדמית; סטודנט יכול לקבל יעד אישי (student_profiles.target_hours_override) */
    requiredHours: hours("required_hours").notNull(),
    /** אבני דרך לתשלום: [{ hours: 45, label: "פעימה 1" }, …] */
    milestones: jsonb("milestones").$type<{ hours: number; label: string }[]>().notNull().default([]),
    maxHoursPerDay: hours("max_hours_per_day"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("programs_org_idx").on(t.organizationId), check("programs_hours_chk", sql`${t.requiredHours} >= 0`)],
);

/* ───────────── 5.4 שנים אקדמיות ───────────── */

export const academicYears = pgTable(
  "academic_years",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    reportDeadline: date("report_deadline", { mode: "string" }),
    isCurrent: boolean("is_current").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("academic_years_org_idx").on(t.organizationId),
    // שנה נוכחית אחת לארגון
    uniqueIndex("academic_years_current_uq").on(t.organizationId).where(sql`${t.isCurrent}`),
    check("academic_years_dates_chk", sql`${t.endDate} > ${t.startDate}`),
  ],
);

/* ───────────── 5.2 פרופיל סטודנט (1:1 עם משתמש) ───────────── */

export const studentProfiles = pgTable(
  "student_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id),
    organizationId: orgId(),
    /** רגיש: סטודנט + מנהל בלבד */
    nationalId: text("national_id"),
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    city: text("city"),
    institution: text("institution"),
    degreeType: degreeTypeEnum("degree_type"),
    degreeYear: degreeYearEnum("degree_year"),
    fieldOfStudy: text("field_of_study"),
    trackId: uuid("track_id").references(() => programs.id),
    /** יעד אישי שדורס את יעד המסלול (PRD 7.6) */
    targetHoursOverride: hours("target_hours_override"),
    academicYearId: uuid("academic_year_id").references(() => academicYears.id),
    /** מפתחות מתוך lookups (kind = 'volunteer_type') */
    preferredTypes: text("preferred_types").array().notNull().default(sql`ARRAY[]::text[]`),
    preferredActivities: text("preferred_activities"),
    availableDays: dayEnum("available_days").array().notNull().default(sql`ARRAY[]::day[]`),
    availableHours: text("available_hours"),
    generalPreferences: text("general_preferences"),
    studentNotes: text("student_notes"),
    /** רגיש: סטודנט + מנהל בלבד */
    bankName: text("bank_name"),
    bankBranch: text("bank_branch"),
    bankAccount: text("bank_account"),
    accountOwner: text("account_owner"),
    /** מפתח אחסון ב-Vercel Blob */
    bankDocument: text("bank_document"),
    profileCompletedAt: timestamp("profile_completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("student_profiles_org_idx").on(t.organizationId)],
);

/* ───────────── 5.5 מקומות התנדבות ───────────── */
// requested / allocated / remaining / approved_hours_current_year: מחושבים, אין עמודות.

export const volunteerPlaces = pgTable(
  "volunteer_places",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    description: text("description"),
    address: text("address"),
    city: text("city"),
    geoLat: numeric("geo_lat", { precision: 9, scale: 6, mode: "number" }),
    geoLng: numeric("geo_lng", { precision: 9, scale: 6, mode: "number" }),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    /** מפתח מתוך lookups (kind = 'volunteer_type'), אותה רשימה כמו preferred_types */
    category: text("category"),
    status: placeStatusEnum("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("volunteer_places_org_idx").on(t.organizationId), index("volunteer_places_status_idx").on(t.status)],
);

/* ───────────── 5.6 חלונות זמן במקום ───────────── */
// allocated_slots: מחושב מ-placements פעילים, אין עמודה.

export const placeTimeWindows = pgTable(
  "place_time_windows",
  {
    id: id(),
    organizationId: orgId(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => volunteerPlaces.id),
    label: text("label").notNull(),
    days: dayEnum("days").array().notNull().default(sql`ARRAY[]::day[]`),
    startTime: time("start_time"),
    endTime: time("end_time"),
    /** שעות שבועיות שתקן אחד נותן בחלון הזה */
    hoursPerSlot: hours("hours_per_slot").notNull(),
    /** מספר תקנים בחלון (עשרוני) */
    slots: hours("slots").notNull(),
    /** ברירת מחדל לתיאור השיבוץ */
    taskDescription: text("task_description"),
    /** חלון שהוסר: לא ניתן לשבץ אליו, שיבוצים קיימים נשארים */
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index("place_time_windows_org_idx").on(t.organizationId),
    index("place_time_windows_place_idx").on(t.placeId),
    check("place_time_windows_slots_chk", sql`${t.slots} >= 0 AND ${t.hoursPerSlot} > 0`),
  ],
);

/* ───────────── 5.7 ראיונות ───────────── */

export const interviews = pgTable(
  "interviews",
  {
    id: id(),
    organizationId: orgId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    interviewerId: uuid("interviewer_id")
      .notNull()
      .references(() => users.id),
    /** "שיבוץ מחדש" של רכז/מנהל = רשומת ראיון בלי שדות ראיון (PRD 7.2) */
    kind: interviewKindEnum("kind").notNull().default("interview"),
    interviewDate: date("interview_date", { mode: "string" }),
    status: interviewStatusEnum("status").notNull().default("draft"),
    generalImpression: impressionEnum("general_impression"),
    notes: text("notes"),
    preferencesDiscussed: text("preferences_discussed"),
    constraintsDiscussed: text("constraints_discussed"),
    placementDecisionNotes: text("placement_decision_notes"),
    summary: text("summary"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("interviews_org_idx").on(t.organizationId),
    index("interviews_student_idx").on(t.studentId),
    // טיוטה אחת פתוחה לסטודנט
    uniqueIndex("interviews_one_draft_uq").on(t.studentId).where(sql`${t.status} = 'draft'`),
  ],
);

/* ───────────── 5.8 שיבוצים (החוזה) ───────────── */

export const placements = pgTable(
  "placements",
  {
    id: id(),
    organizationId: orgId(),
    interviewId: uuid("interview_id")
      .notNull()
      .references(() => interviews.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    placeId: uuid("place_id")
      .notNull()
      .references(() => volunteerPlaces.id),
    timeWindowId: uuid("time_window_id")
      .notNull()
      .references(() => placeTimeWindows.id),
    /** חלק תקן מותר: 0.25, 0.5, 1, 1.5 … */
    slots: hours("slots").notNull(),
    /** החוזה: slots × hours_per_slot, ניתן לעריכה בתוך המכסה */
    weeklyHours: hours("weekly_hours").notNull(),
    assignedDays: dayEnum("assigned_days").array().notNull().default(sql`ARRAY[]::day[]`),
    assignedHours: text("assigned_hours"),
    /** כמה שעות ממולאות מראש בכל דיווח */
    defaultReportHours: hours("default_report_hours"),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(false),
    startedAt: date("started_at", { mode: "string" }),
    endedAt: date("ended_at", { mode: "string" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("placements_org_idx").on(t.organizationId),
    index("placements_student_idx").on(t.studentId),
    index("placements_interview_idx").on(t.interviewId),
    index("placements_window_active_idx").on(t.timeWindowId).where(sql`${t.isActive}`),
    // אותו חלון פעמיים לאותו סטודנט (בשיבוצים פעילים) = חסימה
    uniqueIndex("placements_student_window_active_uq")
      .on(t.studentId, t.timeWindowId)
      .where(sql`${t.isActive}`),
    check("placements_slots_chk", sql`${t.slots} > 0`),
    check("placements_weekly_hours_chk", sql`${t.weeklyHours} > 0`),
  ],
);

/* ───────────── 5.9 דיווחי שעות ───────────── */

export const hourReports = pgTable(
  "hour_reports",
  {
    id: id(),
    organizationId: orgId(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id),
    /** חובה לדיווח התנדבות; היעדרות יכולה להיות בלי שיבוץ */
    placementId: uuid("placement_id").references(() => placements.id),
    placeId: uuid("place_id").references(() => volunteerPlaces.id),
    /** נגזר מהסטודנט בזמן ההגשה, נשמר כצילום מצב */
    coordinatorId: uuid("coordinator_id").references(() => users.id),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    reportType: reportTypeEnum("report_type").notNull().default("volunteering"),
    volunteerDate: date("volunteer_date", { mode: "string" }).notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    /** לא נדרס לעולם */
    reportedHours: hours("reported_hours").notNull(),
    /** מתחיל כ-reported; הרכז יכול לשנות */
    approvedHours: hours("approved_hours").notNull(),
    studentNotes: text("student_notes"),
    status: reportStatusEnum("status").notNull().default("pending"),
    /** חובה בדחייה ובהחזרה לתיקון (נאכף בשירות) */
    coordinatorNotes: text("coordinator_notes"),
    absenceReason: absenceReasonEnum("absence_reason"),
    /** מפתח אחסון ב-Vercel Blob */
    attachment: text("attachment"),
    /** להיעדרות מאושרת: האם השעות נספרות ליעד */
    countsTowardTarget: boolean("counts_toward_target").notNull().default(true),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id),
    /** הסלמה אחת בלבד לדיווח */
    escalationSentAt: timestamp("escalation_sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("hour_reports_org_idx").on(t.organizationId),
    index("hour_reports_student_idx").on(t.studentId, t.volunteerDate),
    index("hour_reports_coordinator_status_idx").on(t.coordinatorId, t.status),
    index("hour_reports_escalation_idx").on(t.submittedAt).where(sql`${t.status} = 'pending' AND ${t.escalationSentAt} IS NULL`),
    check("hour_reports_reported_chk", sql`${t.reportedHours} > 0`),
    check("hour_reports_approved_chk", sql`${t.approvedHours} >= 0`),
    check(
      "hour_reports_volunteering_placement_chk",
      sql`${t.reportType} = 'absence' OR ${t.placementId} IS NOT NULL`,
    ),
  ],
);

/* ───────────── 5.10 הגדרות, רשימות בחירה, לוג ───────────── */

export const settings = pgTable("settings", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id),
  escalationDays: integer("escalation_days").notNull().default(7),
  /** כיבוי ההסלמה / התזכורת לרכז */
  coordinatorReminderEnabled: boolean("coordinator_reminder_enabled").notNull().default(true),
  reminderChannels: channelEnum("reminder_channels").array().notNull().default(sql`ARRAY['email']::channel[]`),
  languages: localeEnum("languages").array().notNull().default(sql`ARRAY['he','en']::locale[]`),
  /** סטודנט שלא דיווח X שבועות: דגל + תזכורת (PRD 7.5) */
  inactivityWeeks: integer("inactivity_weeks").notNull().default(3),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** סוגי התנדבות, מוסדות לימוד, סיבות היעדרות: המנהל עורך מהממשק */
export const lookups = pgTable(
  "lookups",
  {
    id: id(),
    organizationId: orgId(),
    /** volunteer_type | institution | absence_reason */
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    labelHe: text("label_he").notNull(),
    labelEn: text("label_en"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [uniqueIndex("lookups_org_kind_key_uq").on(t.organizationId, t.kind, t.key)],
);

export const customFields = pgTable(
  "custom_fields",
  {
    id: id(),
    organizationId: orgId(),
    entity: customEntityEnum("entity").notNull(),
    key: text("key").notNull(),
    labelHe: text("label_he").notNull(),
    labelEn: text("label_en"),
    type: customFieldTypeEnum("type").notNull(),
    /** לשדות select / multi_select: [{ key, label_he, label_en }] */
    options: jsonb("options").$type<{ key: string; label_he: string; label_en?: string }[]>().notNull().default([]),
    required: boolean("required").notNull().default(false),
    visibleToRoles: roleEnum("visible_to_roles").array().notNull().default(sql`ARRAY['manager']::role[]`),
    editableByRoles: roleEnum("editable_by_roles").array().notNull().default(sql`ARRAY['manager']::role[]`),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [uniqueIndex("custom_fields_org_entity_key_uq").on(t.organizationId, t.entity, t.key)],
);

export const customFieldValues = pgTable(
  "custom_field_values",
  {
    id: id(),
    organizationId: orgId(),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => customFields.id),
    /** מזהה הרשומה (סטודנט / מקום / שיבוץ / דיווח), לפי entity של השדה */
    entityId: uuid("entity_id").notNull(),
    value: jsonb("value"),
  },
  (t) => [
    uniqueIndex("custom_field_values_field_entity_uq").on(t.fieldId, t.entityId),
    index("custom_field_values_entity_idx").on(t.entityId),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    organizationId: orgId(),
    actorId: uuid("actor_id").references(() => users.id),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    /** למשל סיבת ביטול אישור, או "אושרה חריגה מיעד" */
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_org_created_idx").on(t.organizationId, t.createdAt),
    index("audit_log_entity_idx").on(t.entity, t.entityId),
  ],
);
