import { describe, expect, it } from "vitest";
import { RULES, can, type Action, type Entity, type Role, type SessionUser, type Subject } from "@/lib/permissions";

const org = "org-1";
const mk = (id: string, roles: Role[]): SessionUser => ({ id, organizationId: org, roles });

const student = mk("s1", ["student"]);
const coord = mk("c1", ["coordinator"]);
const interviewer = mk("i1", ["interviewer"]);
const manager = mk("m1", ["manager"]);

/** רשומה של סטודנט s1, שמקושר לרכז c1 */
const mine: Subject = { organizationId: org, ownerId: "s1", coordinatorIds: ["c1"] };
/** רשומה של סטודנט אחר, שמקושר לרכז אחר */
const other: Subject = { organizationId: org, ownerId: "s2", coordinatorIds: ["c2"] };

/**
 * ה"snapshot": רשימת ההרשאות המלאה של כל תפקיד, כפי שהיא בסעיף 3 ב-PRD.
 * כל הרחבה בטעות של RULES תיכשל כאן, וכל שינוי מכוון חייב להתעדכן גם בקובץ הזה.
 */
const EXPECTED: Record<Exclude<Role, "manager">, string[]> = {
  student: [
    "read user own", "update user own",
    "read student_profile own", "update student_profile own",
    "read bank_details own", "update bank_details own",
    "read place any", "read program any", "read academic_year any", "read custom_field any",
    "read placement own",
    "read hour_report own", "create hour_report own", "update hour_report own",
  ],
  coordinator: [
    "read user assigned", "read student_profile assigned",
    "read place any", "read time_window any", "read program any", "read academic_year any", "read custom_field any",
    "read placement assigned", "create placement assigned", "update placement assigned",
    "read hour_report assigned", "update hour_report assigned", "approve hour_report assigned", "export hour_report assigned",
  ],
  interviewer: [
    "read user any", "read student_profile any",
    "read place any", "read time_window any", "read program any", "read academic_year any", "read custom_field any",
    "read interview any", "create interview any", "update interview any",
    "read placement any", "create placement any", "update placement any",
    "assign user any",
  ],
};

const fmt = (r: { action: string; entity: string; scope: string }) => `${r.action} ${r.entity} ${r.scope}`;

describe("מטריצת הרשאות – snapshot מול PRD סעיף 3", () => {
  for (const role of ["student", "coordinator", "interviewer"] as const) {
    it(`${role}: בדיוק ההרשאות שהוגדרו, לא יותר`, () => {
      expect(RULES[role].map(fmt).sort()).toEqual([...EXPECTED[role]].sort());
    });
  }
});

describe("סטודנט", () => {
  it("רואה ועורך רק את עצמו", () => {
    expect(can(student, "read", "user", mine)).toBe(true);
    expect(can(student, "update", "student_profile", mine)).toBe(true);
    expect(can(student, "read", "user", other)).toBe(false);
    expect(can(student, "read", "student_profile", other)).toBe(false);
  });

  it("חשבון בנק: רק שלו", () => {
    expect(can(student, "read", "bank_details", mine)).toBe(true);
    expect(can(student, "read", "bank_details", other)).toBe(false);
  });

  it("מדווח ועורך דיווחים של עצמו, לא של אחר", () => {
    expect(can(student, "create", "hour_report", mine)).toBe(true);
    expect(can(student, "update", "hour_report", mine)).toBe(true);
    expect(can(student, "update", "hour_report", other)).toBe(false);
  });

  it("לא מאשר, לא מוחק, לא רואה ראיונות, לוג, הגדרות", () => {
    expect(can(student, "approve", "hour_report", mine)).toBe(false);
    expect(can(student, "delete", "hour_report", mine)).toBe(false);
    expect(can(student, "read", "interview", mine)).toBe(false);
    expect(can(student, "read", "audit_log")).toBe(false);
    expect(can(student, "read", "setting")).toBe(false);
  });

  it("רואה מקומות בקריאה בלבד, ולא חלונות זמן (קיבולת)", () => {
    expect(can(student, "read", "place")).toBe(true);
    expect(can(student, "update", "place")).toBe(false);
    expect(can(student, "read", "time_window")).toBe(false);
  });
});

describe("רכז", () => {
  it("רואה ומאשר רק סטודנטים שמקושרים אליו", () => {
    expect(can(coord, "read", "student_profile", mine)).toBe(true);
    expect(can(coord, "approve", "hour_report", mine)).toBe(true);
    expect(can(coord, "read", "student_profile", other)).toBe(false);
    expect(can(coord, "approve", "hour_report", other)).toBe(false);
    expect(can(coord, "read", "hour_report", other)).toBe(false);
  });

  it("לא רואה חשבון בנק של אף סטודנט, גם לא שלו", () => {
    expect(can(coord, "read", "bank_details", mine)).toBe(false);
    expect(can(coord, "update", "bank_details", mine)).toBe(false);
  });

  it("לא רואה ראיונות, לא מנהל משתמשים ולא מקשר סטודנטים לרכזים", () => {
    expect(can(coord, "read", "interview", mine)).toBe(false);
    expect(can(coord, "create", "user")).toBe(false);
    expect(can(coord, "assign", "user", mine)).toBe(false);
    expect(can(coord, "read", "audit_log")).toBe(false);
  });

  it("רואה את כל המקומות והקיבולת, אבל לא עורך אותם", () => {
    expect(can(coord, "read", "place")).toBe(true);
    expect(can(coord, "read", "time_window")).toBe(true);
    expect(can(coord, "update", "place")).toBe(false);
  });

  it("משבץ מחדש רק סטודנט שלו", () => {
    expect(can(coord, "create", "placement", mine)).toBe(true);
    expect(can(coord, "create", "placement", other)).toBe(false);
  });

  it("סטודנט ללא רכז: אף רכז לא רואה אותו", () => {
    expect(can(coord, "read", "student_profile", { organizationId: org, ownerId: "s3", coordinatorIds: [] })).toBe(false);
    expect(can(coord, "read", "student_profile", { organizationId: org, ownerId: "s3" })).toBe(false);
  });
});

describe("מראיין", () => {
  it("רואה את כל הסטודנטים, ממלא ראיון ומשבץ", () => {
    expect(can(interviewer, "read", "student_profile", other)).toBe(true);
    expect(can(interviewer, "create", "interview")).toBe(true);
    expect(can(interviewer, "update", "interview")).toBe(true);
    expect(can(interviewer, "create", "placement")).toBe(true);
    expect(can(interviewer, "assign", "user")).toBe(true);
  });

  it("לא רואה דיווחי שעות, חשבון בנק, ולא מנהל משתמשים", () => {
    expect(can(interviewer, "read", "hour_report", mine)).toBe(false);
    expect(can(interviewer, "approve", "hour_report", mine)).toBe(false);
    expect(can(interviewer, "read", "bank_details", mine)).toBe(false);
    expect(can(interviewer, "create", "user")).toBe(false);
    expect(can(interviewer, "update", "user")).toBe(false);
    expect(can(interviewer, "delete", "user")).toBe(false);
  });
});

describe("מנהל", () => {
  it("רואה ועושה הכל בארגון, כולל בנק ולוג", () => {
    expect(can(manager, "read", "bank_details", mine)).toBe(true);
    expect(can(manager, "read", "audit_log")).toBe(true);
    expect(can(manager, "delete", "user", mine)).toBe(true);
    expect(can(manager, "approve", "hour_report", other)).toBe(true);
  });

  it("חסום מחוץ לארגון שלו", () => {
    expect(can(manager, "read", "user", { organizationId: "org-2" })).toBe(false);
  });
});

describe("כמה תפקידים למשתמש אחד", () => {
  it("רכז שהוא גם מראיין: איחוד ההרשאות", () => {
    const both = mk("c1", ["coordinator", "interviewer"]);
    expect(can(both, "create", "interview")).toBe(true);
    expect(can(both, "approve", "hour_report", mine)).toBe(true);
    // ועדיין לא רואה דיווחים של סטודנט של רכז אחר
    expect(can(both, "approve", "hour_report", other)).toBe(false);
    // ולא רואה בנק
    expect(can(both, "read", "bank_details", mine)).toBe(false);
  });

  it("רכז שהוא גם סטודנט: הסטודנט שבו לא מקבל הרשאות רכז, ולהפך", () => {
    const both = mk("c1", ["coordinator", "student"]);
    expect(can(both, "read", "bank_details", { organizationId: org, ownerId: "c1" })).toBe(true);
    expect(can(both, "read", "bank_details", other)).toBe(false);
  });
});

describe("חיתוך מלא: אף תפקיד שאינו מנהל לא יכול למחוק, לייצא לוג או לשנות הגדרות", () => {
  const entities: Entity[] = ["user", "student_profile", "bank_details", "program", "academic_year", "place", "time_window", "interview", "placement", "hour_report", "setting", "custom_field", "audit_log"];
  const roles: Role[] = ["student", "coordinator", "interviewer"];
  const everything: Subject = { organizationId: org, ownerId: "x", coordinatorIds: ["x"] };
  it.each(roles)("%s", (role) => {
    const u = mk("x", [role]);
    for (const e of entities) {
      expect(can(u, "delete" as Action, e, everything)).toBe(false);
      expect(can(u, "export" as Action, e, everything) && !(role === "coordinator" && e === "hour_report")).toBe(false);
    }
    for (const e of ["setting", "audit_log", "custom_field", "program", "academic_year", "place", "time_window"] as Entity[]) {
      expect(can(u, "update", e, everything)).toBe(false);
      expect(can(u, "create", e, everything)).toBe(false);
    }
  });
});
