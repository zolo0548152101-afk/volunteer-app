import { describe, expect, it } from "vitest";
import {
  approvedHoursTotal,
  defaultWeeklyHours,
  evaluateContract,
  placeUsage,
  round2,
  studentBank,
  studentTarget,
  weeksRemaining,
  windowUsage,
  type PlacementLike,
  type ReportLike,
  type WindowInfo,
} from "@/lib/services/capacity";

// חלון: 4 תקנים × 4 שעות = 16 שעות שבועיות מבוקשות
const win = (over: Partial<WindowInfo> = {}): WindowInfo => ({
  id: "w1",
  placeId: "p1",
  slots: 4,
  hoursPerSlot: 4,
  isActive: true,
  ...over,
});

const pl = (over: Partial<PlacementLike> = {}): PlacementLike => ({
  studentId: "s-other",
  timeWindowId: "w1",
  slots: 1,
  weeklyHours: 4,
  isActive: true,
  ...over,
});

describe("תפוסת חלון (צד המוסד)", () => {
  it("חלון ריק: הכל פנוי", () => {
    expect(windowUsage(win(), [])).toEqual({
      requestedHours: 16,
      allocatedSlots: 0,
      allocatedHours: 0,
      remainingSlots: 4,
      remainingHours: 16,
    });
  });

  it("סופר רק שיבוצים פעילים: לא פעיל לא תופס מקום (היסטוריה)", () => {
    const u = windowUsage(win(), [pl(), pl({ isActive: false, slots: 2, weeklyHours: 8 })]);
    expect(u.allocatedSlots).toBe(1);
    expect(u.remainingSlots).toBe(3);
    expect(u.remainingHours).toBe(12);
  });

  it("שברי תקן 0.25 / 0.5 מצטברים בלי שגיאת נקודה צפה", () => {
    const placements = [0.25, 0.25, 0.25, 0.25, 0.5].map((s, i) =>
      pl({ studentId: `s${i}`, slots: s, weeklyHours: round2(s * 4) }),
    );
    const u = windowUsage(win(), placements);
    expect(u.allocatedSlots).toBe(1.5);
    expect(u.allocatedHours).toBe(6);
    expect(u.remainingSlots).toBe(2.5);
  });

  it("0.1 + 0.2: אין זליגה של נקודה צפה", () => {
    const u = windowUsage(win({ slots: 1, hoursPerSlot: 1 }), [
      pl({ studentId: "a", slots: 0.1, weeklyHours: 0.1 }),
      pl({ studentId: "b", slots: 0.2, weeklyHours: 0.2 }),
    ]);
    expect(u.allocatedSlots).toBe(0.3);
    expect(u.remainingSlots).toBe(0.7);
  });

  it("שיבוצי חלונות אחרים לא נספרים", () => {
    const u = windowUsage(win(), [pl({ timeWindowId: "w2", slots: 3, weeklyHours: 12 })]);
    expect(u.allocatedSlots).toBe(0);
  });

  it("סיכום מקום: מבוקש / משובץ / פנוי מכל החלונות הפעילים, מתעלם מחלון שהוסר", () => {
    const windows = [win(), win({ id: "w2", slots: 2, hoursPerSlot: 3 }), win({ id: "w3", isActive: false })];
    const u = placeUsage(windows, [pl(), pl({ timeWindowId: "w2", slots: 1, weeklyHours: 3 })]);
    expect(u.requestedHours).toBe(22); // 16 + 6
    expect(u.allocatedHours).toBe(7);
    expect(u.remainingHours).toBe(15);
  });

  it("ברירת מחדל לשעות החוזה: תקנים × שעות לתקן", () => {
    expect(defaultWeeklyHours(win(), 0.5)).toBe(2);
    expect(defaultWeeklyHours(win({ hoursPerSlot: 3.5 }), 1.5)).toBe(5.25);
  });
});

describe("בנק הסטודנט", () => {
  it("שבועות שנותרו: כולל היום, ועשרוני", () => {
    expect(weeksRemaining("2026-10-15", "2026-10-21")).toBe(1);
    expect(weeksRemaining("2026-10-15", "2026-10-15")).toBe(0.14);
    expect(weeksRemaining("2026-10-16", "2026-10-15")).toBe(0);
  });

  it("יעד אישי דורס יעד מסלול", () => {
    expect(studentTarget(140, null)).toBe(140);
    expect(studentTarget(140, 100)).toBe(100);
    expect(studentTarget(140, 0)).toBe(0);
  });

  it("רק approved נספר; היעדרות רק אם סומנה כנספרת; שנה אחרת לא נספרת", () => {
    const r = (o: Partial<ReportLike>): ReportLike => ({
      academicYearId: "y1",
      reportType: "volunteering",
      status: "approved",
      approvedHours: 3,
      countsTowardTarget: true,
      ...o,
    });
    const total = approvedHoursTotal(
      [
        r({}),
        r({ status: "pending" }),
        r({ status: "rejected" }),
        r({ status: "needs_correction" }),
        r({ reportType: "absence", countsTowardTarget: false }),
        r({ reportType: "absence", countsTowardTarget: true, approvedHours: 2.5 }),
        r({ academicYearId: "y0" }),
      ],
      "y1",
    );
    expect(total).toBe(5.5);
  });

  it("חוזה שמכסה בדיוק את היעד שנותר: ok", () => {
    // 14 שבועות × 10 שעות = 140
    const b = studentBank({ target: 140, approved: 0, asOf: "2026-11-01", yearEnd: "2027-02-06", contractWeekly: 10 });
    expect(b.weeksRemaining).toBe(14);
    expect(b.plannedHours).toBe(140);
    expect(b.status).toBe("ok");
  });

  it("חוזה קטן מדי: under, וחוזה גדול מדי: over", () => {
    const base = { target: 140, approved: 0, asOf: "2026-11-01", yearEnd: "2027-02-06" };
    expect(studentBank({ ...base, contractWeekly: 6 }).status).toBe("under");
    expect(studentBank({ ...base, contractWeekly: 14 }).status).toBe("over");
  });

  it("שעות שכבר אושרו מורידות את הצורך", () => {
    const b = studentBank({ target: 140, approved: 100, asOf: "2026-11-01", yearEnd: "2027-02-06", contractWeekly: 2.9 });
    expect(b.remainingNeed).toBe(40);
    expect(b.neededWeekly).toBe(2.86);
    expect(b.plannedHours).toBe(40.6);
    expect(b.status).toBe("ok"); // פער 0.6 שעות, בתוך הסובלנות (שעה)
    // 3 שעות בשבוע = 42, פער של שעתיים: חריגה
    expect(studentBank({ target: 140, approved: 100, asOf: "2026-11-01", yearEnd: "2027-02-06", contractWeekly: 3 }).status).toBe("over");
  });

  it("יעד כבר הושג: כל חוזה הוא over, ולא מחולק באפס", () => {
    const b = studentBank({ target: 100, approved: 120, asOf: "2026-11-01", yearEnd: "2027-02-06", contractWeekly: 5 });
    expect(b.remainingNeed).toBe(0);
    expect(b.status).toBe("over");
  });

  it("אחרי סוף השנה: אין שבועות, אין חלוקה באפס", () => {
    const b = studentBank({ target: 100, approved: 0, asOf: "2027-03-01", yearEnd: "2027-02-06", contractWeekly: 5 });
    expect(b.weeksRemaining).toBe(0);
    expect(b.neededWeekly).toBe(0);
    expect(b.plannedHours).toBe(0);
  });
});

describe("ולידציה דו-כיוונית של חוזה", () => {
  const bank = { target: 140, approved: 0, asOf: "2026-11-01", yearEnd: "2027-02-06" };
  const codes = (e: ReturnType<typeof evaluateContract>) => e.issues.map((i) => i.code);

  it("חוזה תקין בתוך החלון ובתוך היעד: אין בעיות", () => {
    const e = evaluateContract({
      studentId: "me",
      proposed: [{ timeWindowId: "w1", slots: 2.5, weeklyHours: 10 }],
      windows: [win()],
      activePlacements: [],
      bank,
    });
    expect(e.issues).toEqual([]);
    expect(e.blocked).toBe(false);
    expect(e.windows.w1.remainingSlots).toBe(1.5);
    expect(e.windows.w1.remainingHours).toBe(6);
  });

  it("חריגה מתקני החלון: חסימה", () => {
    const e = evaluateContract({
      studentId: "me",
      proposed: [{ timeWindowId: "w1", slots: 1, weeklyHours: 4 }],
      windows: [win()],
      activePlacements: [pl({ studentId: "a", slots: 3.5, weeklyHours: 14 })],
    });
    expect(codes(e)).toContain("window_over_slots");
    expect(e.blocked).toBe(true);
  });

  it("חריגה משעות החלון גם כשהתקנים מספיקים: חסימה", () => {
    const e = evaluateContract({
      studentId: "me",
      proposed: [{ timeWindowId: "w1", slots: 0.5, weeklyHours: 2 }],
      windows: [win()],
      activePlacements: [pl({ studentId: "a", slots: 1, weeklyHours: 15 })],
    });
    expect(codes(e)).toContain("window_over_hours");
    expect(e.blocked).toBe(true);
  });

  it("החוזה לא יכול לתת יותר שעות ממה שהתקנים מכילים", () => {
    const e = evaluateContract({
      studentId: "me",
      proposed: [{ timeWindowId: "w1", slots: 1, weeklyHours: 5 }],
      windows: [win()],
      activePlacements: [],
    });
    expect(codes(e)).toContain("weekly_hours_over_slots");
    expect(e.blocked).toBe(true);
  });

  it("אותו חלון פעמיים באותו חוזה: חסימה", () => {
    const e = evaluateContract({
      studentId: "me",
      proposed: [
        { timeWindowId: "w1", slots: 1, weeklyHours: 4 },
        { timeWindowId: "w1", slots: 1, weeklyHours: 4 },
      ],
      windows: [win()],
      activePlacements: [],
    });
    expect(codes(e)).toContain("duplicate_window");
    expect(e.blocked).toBe(true);
  });

  it("שני מקומות לסטודנט אחד: שני חלונות, כל אחד נבדק בנפרד והחוזה מצטבר מול היעד", () => {
    const windows = [win(), win({ id: "w2", placeId: "p2", slots: 2, hoursPerSlot: 3 })];
    const e = evaluateContract({
      studentId: "me",
      proposed: [
        { timeWindowId: "w1", slots: 1, weeklyHours: 4 },
        { timeWindowId: "w2", slots: 2, weeklyHours: 6 },
      ],
      windows,
      activePlacements: [],
      bank: { ...bank, target: 140 },
    });
    expect(e.blocked).toBe(false);
    expect(e.bank?.contractWeekly).toBe(10);
    expect(e.bank?.status).toBe("ok");
    expect(Object.keys(e.windows).sort()).toEqual(["w1", "w2"]);
  });

  it("שיבוצים קודמים של אותו סטודנט לא תופסים מקום: הם מוחלפים בסגירת הראיון", () => {
    // החלון מלא כולו, אבל על ידי הסטודנט עצמו. חוזה חדש לאותו חלון מותר.
    const e = evaluateContract({
      studentId: "me",
      proposed: [{ timeWindowId: "w1", slots: 4, weeklyHours: 16 }],
      windows: [win()],
      activePlacements: [pl({ studentId: "me", slots: 4, weeklyHours: 16 })],
    });
    expect(e.blocked).toBe(false);
  });

  it("חלון שהוסר או לא קיים: חסימה", () => {
    const removed = evaluateContract({
      studentId: "me",
      proposed: [{ timeWindowId: "w1", slots: 1, weeklyHours: 4 }],
      windows: [win({ isActive: false })],
      activePlacements: [],
    });
    expect(codes(removed)).toContain("window_inactive");
    const missing = evaluateContract({
      studentId: "me",
      proposed: [{ timeWindowId: "nope", slots: 1, weeklyHours: 4 }],
      windows: [win()],
      activePlacements: [],
    });
    expect(codes(missing)).toContain("window_not_found");
  });

  it("שיבוץ בלי תקנים או שעות: חסימה", () => {
    const e = evaluateContract({
      studentId: "me",
      proposed: [{ timeWindowId: "w1", slots: 0, weeklyHours: 0 }],
      windows: [win()],
      activePlacements: [],
    });
    expect(codes(e)).toEqual(expect.arrayContaining(["slots_not_positive", "weekly_hours_not_positive"]));
    expect(e.blocked).toBe(true);
  });

  it("פער מיעד הסטודנט הוא אזהרה בלבד: לא חוסם, דורש אישור מנהל", () => {
    const under = evaluateContract({
      studentId: "me",
      proposed: [{ timeWindowId: "w1", slots: 1, weeklyHours: 4 }],
      windows: [win()],
      activePlacements: [],
      bank,
    });
    expect(codes(under)).toEqual(["student_under_target"]);
    expect(under.blocked).toBe(false);
    expect(under.needsManagerOverride).toBe(true);

    const over = evaluateContract({
      studentId: "me",
      proposed: [{ timeWindowId: "w1", slots: 4, weeklyHours: 16 }],
      windows: [win()],
      activePlacements: [],
      bank,
    });
    expect(codes(over)).toEqual(["student_over_target"]);
    expect(over.blocked).toBe(false);
  });

  it("חסימה מוסדית וגם אזהרת סטודנט יחד: נחסם, ולא ניתן לעקוף בגלל החסימה", () => {
    const e = evaluateContract({
      studentId: "me",
      proposed: [{ timeWindowId: "w1", slots: 2, weeklyHours: 8 }],
      windows: [win()],
      activePlacements: [pl({ studentId: "a", slots: 3, weeklyHours: 12 })],
      bank,
    });
    expect(e.blocked).toBe(true);
    expect(e.needsManagerOverride).toBe(true);
  });
});
