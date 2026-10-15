import { describe, expect, it } from "vitest";
import {
  assertCan,
  can,
  createCan,
  ForbiddenError,
  type RuleTable,
  type SessionUser,
} from "@/lib/permissions";

const org = "org-1";
const mk = (id: string, roles: SessionUser["roles"]): SessionUser => ({
  id,
  organizationId: org,
  roles,
});

describe("permissions – ברירת מחדל חסימה", () => {
  it("בלי משתמש: חסום", () => {
    expect(can(null, "read", "user")).toBe(false);
    expect(can(undefined, "read", "user")).toBe(false);
  });

  it("סטודנט, רכז ומראיין: חסומים על כל מה שלא הוגדר במפורש", () => {
    for (const role of ["student", "coordinator", "interviewer"] as const) {
      expect(can(mk("u", [role]), "delete", "audit_log")).toBe(false);
      expect(can(mk("u", [role]), "export", "audit_log")).toBe(false);
      expect(can(mk("u", [role]), "read", "setting")).toBe(false);
    }
  });

  it("מנהל: מותר על הכל בארגון שלו", () => {
    const m = mk("m", ["manager"]);
    expect(can(m, "approve", "hour_report")).toBe(true);
    expect(can(m, "read", "bank_details")).toBe(true);
    expect(can(m, "delete", "user", { organizationId: org })).toBe(true);
  });

  it("מנהל: חסום על רשומה מארגון אחר", () => {
    const m = mk("m", ["manager"]);
    expect(can(m, "read", "user", { organizationId: "org-2" })).toBe(false);
  });
});

describe("permissions – scope", () => {
  const table: RuleTable = {
    student: [{ action: "read", entity: "hour_report", scope: "own" }],
    coordinator: [{ action: "approve", entity: "hour_report", scope: "assigned" }],
    interviewer: [],
    manager: [],
  };
  const check = createCan(table);

  it("own: רק רשומה של עצמו", () => {
    const s = mk("s1", ["student"]);
    expect(check(s, "read", "hour_report", { ownerId: "s1" })).toBe(true);
    expect(check(s, "read", "hour_report", { ownerId: "s2" })).toBe(false);
    expect(check(s, "read", "hour_report")).toBe(false);
  });

  it("assigned: רק סטודנט שמשויך אליו כרכז", () => {
    const c = mk("c1", ["coordinator"]);
    expect(check(c, "approve", "hour_report", { coordinatorIds: ["c1"] })).toBe(true);
    expect(check(c, "approve", "hour_report", { coordinatorIds: ["c2"] })).toBe(false);
    expect(check(c, "approve", "hour_report", { coordinatorIds: [] })).toBe(false);
    expect(check(c, "approve", "hour_report", { coordinatorIds: ["c2", "c1"] })).toBe(true);
  });

  it("כמה תפקידים: איחוד ההרשאות", () => {
    const both = mk("x", ["student", "coordinator"]);
    expect(check(both, "read", "hour_report", { ownerId: "x" })).toBe(true);
    expect(check(both, "approve", "hour_report", { coordinatorIds: ["x"] })).toBe(true);
    expect(check(both, "delete", "hour_report", { ownerId: "x" })).toBe(false);
  });
});

describe("assertCan", () => {
  it("זורק ForbiddenError כשאין הרשאה", () => {
    expect(() => assertCan(mk("s", ["student"]), "read", "user")).toThrow(ForbiddenError);
    expect(() => assertCan(null, "read", "user")).toThrow(ForbiddenError);
  });

  it("לא זורק למנהל", () => {
    expect(() => assertCan(mk("m", ["manager"]), "read", "user")).not.toThrow();
  });
});
