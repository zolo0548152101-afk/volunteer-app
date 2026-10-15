/**
 * בנק השעות הדו-צדדי (PRD 7.1). פונקציות טהורות, בלי DB, כדי שיהיה קל לבדוק אותן.
 * הקיבולת אף פעם לא נשמרת: היא תמיד מחושבת מרשימת שיבוצים פעילים (is_active = true).
 * חשבון בסנטים (מאית שעה) כדי שלא יהיו שגיאות נקודה צפה בשברים כמו 0.25 / 0.5.
 *
 * שני כיוונים:
 *  - מוסד (חלון זמן): חריגה מתקנים או משעות החלון = חסימה (block), אי אפשר לאשר.
 *  - סטודנט: פער מהיעד, פחות או יותר = אזהרה (warn); מנהל יכול לאשר חריגה (נרשם בלוג).
 */

const toC = (n: number) => Math.round(n * 100);
const fromC = (c: number) => c / 100;
export const round2 = (n: number) => fromC(toC(n));
const sum = (xs: number[]) => fromC(xs.reduce((a, x) => a + toC(x), 0));

/* ───────────── טיפוסים ───────────── */

export type WindowInfo = {
  id: string;
  placeId: string;
  slots: number;
  hoursPerSlot: number;
  isActive: boolean;
};

/** שיבוץ כפי שהוא נשמר (רק isActive = true נספר) */
export type PlacementLike = {
  studentId: string;
  timeWindowId: string;
  slots: number;
  weeklyHours: number;
  isActive: boolean;
};

export type ProposedPlacement = {
  timeWindowId: string;
  slots: number;
  weeklyHours: number;
};

/* ───────────── צד המוסד: תפוסת חלון ───────────── */

export type WindowUsage = {
  /** שעות שבועיות שהמוסד ביקש = slots × hoursPerSlot */
  requestedHours: number;
  allocatedSlots: number;
  allocatedHours: number;
  remainingSlots: number;
  remainingHours: number;
};

/**
 * @param excludeStudentId שיבוצים פעילים של הסטודנט הזה לא נספרים: משמש בסגירת ראיון,
 *   כי שיבוציו הקודמים עומדים להיות מושבתים באותה טרנזקציה.
 */
export function windowUsage(
  window: WindowInfo,
  placements: PlacementLike[],
  opts: { excludeStudentId?: string } = {},
): WindowUsage {
  const mine = placements.filter(
    (p) => p.isActive && p.timeWindowId === window.id && p.studentId !== opts.excludeStudentId,
  );
  const requestedHours = round2(window.slots * window.hoursPerSlot);
  const allocatedSlots = sum(mine.map((p) => p.slots));
  const allocatedHours = sum(mine.map((p) => p.weeklyHours));
  return {
    requestedHours,
    allocatedSlots,
    allocatedHours,
    remainingSlots: round2(window.slots - allocatedSlots),
    remainingHours: round2(requestedHours - allocatedHours),
  };
}

/** סיכום מקום = סכום חלונותיו הפעילים. מחשב מבוקש / משובץ / פנוי (PRD 5.5) */
export function placeUsage(
  windows: WindowInfo[],
  placements: PlacementLike[],
  opts: { excludeStudentId?: string } = {},
) {
  const usages = windows.filter((w) => w.isActive).map((w) => windowUsage(w, placements, opts));
  return {
    requestedHours: sum(usages.map((u) => u.requestedHours)),
    allocatedHours: sum(usages.map((u) => u.allocatedHours)),
    remainingHours: sum(usages.map((u) => u.remainingHours)),
  };
}

/** ברירת מחדל לשעות החוזה כשבוחרים חלון ומספר תקנים */
export const defaultWeeklyHours = (window: Pick<WindowInfo, "hoursPerSlot">, slots: number) =>
  round2(slots * window.hoursPerSlot);

/* ───────────── צד הסטודנט: בנק יעד ───────────── */

/** ימים → שבועות (עשרוני). 0 אם התאריך אחרי סוף השנה. ISO yyyy-mm-dd, חישוב בימים שלמים */
export function weeksRemaining(asOf: string, yearEnd: string): number {
  const day = 86_400_000;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${yearEnd}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new Error("invalid date");
  const days = Math.round((b - a) / day) + 1; // כולל היום
  return days <= 0 ? 0 : round2(days / 7);
}

export type ReportLike = {
  academicYearId: string;
  reportType: "volunteering" | "absence";
  status: "pending" | "approved" | "rejected" | "needs_correction";
  approvedHours: number;
  countsTowardTarget: boolean;
};

/** רק approved נספר. היעדרות נספרת רק אם הרכז סימן counts_toward_target */
export function approvedHoursTotal(reports: ReportLike[], academicYearId: string): number {
  return sum(
    reports
      .filter(
        (r) =>
          r.academicYearId === academicYearId &&
          r.status === "approved" &&
          (r.reportType === "volunteering" || r.countsTowardTarget),
      )
      .map((r) => r.approvedHours),
  );
}

/** יעד אישי דורס את יעד המסלול (PRD 7.6) */
export const studentTarget = (programRequired: number, override?: number | null) =>
  override ?? programRequired;

/**
 * TODO(question): סף סובלנות לפער מהיעד לפני שמתריעים. ברירת מחדל: שעה אחת.
 * שבועות חלקיים מתחילת/סוף שנה יוצרים פערים קטנים שלא שווה להתריע עליהם.
 */
export const DEFAULT_TOLERANCE_HOURS = 1;

export type StudentBank = {
  target: number;
  approved: number;
  /** כמה שעות עוד צריך לבצע כדי לסגור את היעד */
  remainingNeed: number;
  weeksRemaining: number;
  /** שעות שבועיות שצריך כדי לסגור את היעד בזמן שנותר (0 אם נגמרה השנה) */
  neededWeekly: number;
  contractWeekly: number;
  /** חוזה × שבועות שנותרו */
  plannedHours: number;
  /** planned − remainingNeed. שלילי = פער, חיובי = חריגה */
  gap: number;
  status: "under" | "ok" | "over";
};

export function studentBank(input: {
  target: number;
  approved: number;
  asOf: string;
  yearEnd: string;
  contractWeekly: number;
  toleranceHours?: number;
}): StudentBank {
  const tol = input.toleranceHours ?? DEFAULT_TOLERANCE_HOURS;
  const weeks = weeksRemaining(input.asOf, input.yearEnd);
  const remainingNeed = round2(Math.max(0, input.target - input.approved));
  const contractWeekly = round2(input.contractWeekly);
  const plannedHours = round2(contractWeekly * weeks);
  const gap = round2(plannedHours - remainingNeed);
  return {
    target: round2(input.target),
    approved: round2(input.approved),
    remainingNeed,
    weeksRemaining: weeks,
    neededWeekly: weeks > 0 ? round2(remainingNeed / weeks) : 0,
    contractWeekly,
    plannedHours,
    gap,
    status: gap < -tol ? "under" : gap > tol ? "over" : "ok",
  };
}

/* ───────────── ולידציה דו-כיוונית ───────────── */

export type Issue = {
  code:
    | "window_not_found"
    | "window_inactive"
    | "slots_not_positive"
    | "weekly_hours_not_positive"
    | "duplicate_window"
    | "window_over_slots"
    | "window_over_hours"
    | "weekly_hours_over_slots"
    | "student_under_target"
    | "student_over_target";
  /** block: אי אפשר לשמור. warn: מותר, ומנהל יכול לאשר חריגה */
  severity: "block" | "warn";
  timeWindowId?: string;
};

export type ContractEvaluation = {
  issues: Issue[];
  blocked: boolean;
  /** יש אזהרות (פער מיעד) שמנהל יכול לאשר */
  needsManagerOverride: boolean;
  bank: StudentBank | null;
  /** כמה נשאר בכל חלון אחרי החוזה המוצע (לפאנל "שני הבנקים") */
  windows: Record<string, WindowUsage>;
};

/**
 * בודק חוזה מוצע (כל שורות השיבוץ של ראיון) מול שני הבנקים.
 * @param activePlacements כל השיבוצים הפעילים הרלוונטיים לחלונות. שיבוצי הסטודנט עצמו
 *   מוחרגים אוטומטית, כי סגירת הראיון מחליפה אותם.
 */
export function evaluateContract(input: {
  studentId: string;
  proposed: ProposedPlacement[];
  windows: WindowInfo[];
  activePlacements: PlacementLike[];
  bank?: { target: number; approved: number; asOf: string; yearEnd: string; toleranceHours?: number };
}): ContractEvaluation {
  const issues: Issue[] = [];
  const byId = new Map(input.windows.map((w) => [w.id, w]));
  const seen = new Set<string>();
  const windows: Record<string, WindowUsage> = {};

  // סכום מוצע לכל חלון (כדי לבדוק חריגה מצטברת, למקרה שיש כמה שורות באותו חלון)
  const proposedByWindow = new Map<string, { slots: number; hours: number }>();

  for (const p of input.proposed) {
    const w = byId.get(p.timeWindowId);
    if (!w) {
      issues.push({ code: "window_not_found", severity: "block", timeWindowId: p.timeWindowId });
      continue;
    }
    if (!w.isActive) issues.push({ code: "window_inactive", severity: "block", timeWindowId: w.id });
    if (p.slots <= 0) issues.push({ code: "slots_not_positive", severity: "block", timeWindowId: w.id });
    if (p.weeklyHours <= 0) issues.push({ code: "weekly_hours_not_positive", severity: "block", timeWindowId: w.id });
    if (seen.has(w.id)) issues.push({ code: "duplicate_window", severity: "block", timeWindowId: w.id });
    seen.add(w.id);
    // החוזה לא יכול לתת יותר שעות ממה שהתקנים שנבחרו מכילים
    if (toC(p.weeklyHours) > toC(p.slots * w.hoursPerSlot)) {
      issues.push({ code: "weekly_hours_over_slots", severity: "block", timeWindowId: w.id });
    }
    const acc = proposedByWindow.get(w.id) ?? { slots: 0, hours: 0 };
    proposedByWindow.set(w.id, { slots: sum([acc.slots, p.slots]), hours: sum([acc.hours, p.weeklyHours]) });
  }

  for (const [windowId, add] of proposedByWindow) {
    const w = byId.get(windowId)!;
    const base = windowUsage(w, input.activePlacements, { excludeStudentId: input.studentId });
    if (toC(add.slots) > toC(base.remainingSlots)) {
      issues.push({ code: "window_over_slots", severity: "block", timeWindowId: windowId });
    }
    if (toC(add.hours) > toC(base.remainingHours)) {
      issues.push({ code: "window_over_hours", severity: "block", timeWindowId: windowId });
    }
    windows[windowId] = {
      ...base,
      allocatedSlots: sum([base.allocatedSlots, add.slots]),
      allocatedHours: sum([base.allocatedHours, add.hours]),
      remainingSlots: round2(base.remainingSlots - add.slots),
      remainingHours: round2(base.remainingHours - add.hours),
    };
  }

  let bank: StudentBank | null = null;
  if (input.bank) {
    bank = studentBank({
      ...input.bank,
      contractWeekly: sum(input.proposed.map((p) => p.weeklyHours)),
    });
    if (bank.status === "under") issues.push({ code: "student_under_target", severity: "warn" });
    if (bank.status === "over") issues.push({ code: "student_over_target", severity: "warn" });
  }

  return {
    issues,
    blocked: issues.some((i) => i.severity === "block"),
    needsManagerOverride: issues.some((i) => i.severity === "warn"),
    bank,
    windows,
  };
}
