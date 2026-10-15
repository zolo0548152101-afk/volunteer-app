import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, nextSendDecision, type Rule } from "@/lib/services/reminders";

const t0 = new Date("2026-10-01T08:00:00Z");
const day = (n: number) => new Date(t0.getTime() + n * 86_400_000);
const rule = (o: Partial<Rule> = {}): Rule => ({ ...DEFAULT_RULES.report_escalation, ...o });
const decide = (r: Rule, now: Date, sentCount = 0, lastSentAt: Date | null = null) =>
  nextSendDecision({ rule: r, triggeredAt: t0, sentCount, lastSentAt, now });

describe("מדיניות התראות", () => {
  it("כבוי: אף פעם לא שולח", () => {
    expect(decide(rule({ enabled: false }), day(100))).toEqual({ send: false, reason: "disabled", dueAt: null });
  });

  it("ברירת מחדל: מוקדם מדי לפני 7 ימים, שולח ביום ה-7 בדיוק", () => {
    expect(decide(rule(), day(6.9))).toMatchObject({ send: false, reason: "too_early" });
    expect(decide(rule(), day(7))).toMatchObject({ send: true, reason: "due" });
  });

  it("הזמן להתראה הראשונה ניתן לשינוי", () => {
    const r = rule({ firstAfterDays: 3 });
    expect(decide(r, day(2.9)).send).toBe(false);
    expect(decide(r, day(3)).send).toBe(true);
    expect(decide(rule({ firstAfterDays: 0 }), day(0)).send).toBe(true);
  });

  it("פעם אחת בלבד (ברירת מחדל): אחרי שנשלחה, לא שולח שוב לעולם", () => {
    expect(decide(rule(), day(60), 1, day(7))).toEqual({ send: false, reason: "max_reached", dueAt: null });
  });

  it("כמה פעמים: חוזר כל repeatEveryDays מהשליחה האחרונה, עד המקסימום", () => {
    const r = rule({ maxSends: 3, repeatEveryDays: 2 });
    expect(decide(r, day(7))).toMatchObject({ send: true });
    expect(decide(r, day(8), 1, day(7))).toMatchObject({ send: false, reason: "repeat_wait" });
    expect(decide(r, day(9), 1, day(7))).toMatchObject({ send: true, reason: "due" });
    expect(decide(r, day(11), 2, day(9))).toMatchObject({ send: true });
    expect(decide(r, day(30), 3, day(11))).toMatchObject({ send: false, reason: "max_reached" });
  });

  it("הפער בין חזרות נמדד מהשליחה האחרונה, לא מהאירוע המפעיל (שליחה מאוחרת לא יוצרת מטח)", () => {
    const r = rule({ maxSends: 2, repeatEveryDays: 5 });
    // ה-cron רץ באיחור: הראשונה נשלחה ביום 20. השנייה מחכה עד יום 25, לא יוצאת מיד
    expect(decide(r, day(21), 1, day(20))).toMatchObject({ send: false, reason: "repeat_wait" });
    expect(decide(r, day(25), 1, day(20))).toMatchObject({ send: true });
  });

  it("ה-dueAt מוחזר לתצוגה למנהל", () => {
    expect(decide(rule(), day(1)).dueAt).toEqual(day(7));
  });

  it("ברירות המחדל תואמות את ה-PRD: הסלמה 7 ימים פעם אחת עם עותק למנהל, חוסר פעילות 3 שבועות", () => {
    expect(DEFAULT_RULES.report_escalation).toMatchObject({ firstAfterDays: 7, maxSends: 1, copyManager: true });
    expect(DEFAULT_RULES.student_inactivity).toMatchObject({ firstAfterDays: 21, maxSends: 1 });
  });
});
