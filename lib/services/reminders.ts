/**
 * מדיניות התראות (PRD 7.5). אין כאן קבועים קשיחים: הכל מגיע מ-notification_rules,
 * שהמנהל עורך מהממשק: האם נשלח, אחרי כמה ימים, כמה פעמים, כל כמה זמן חוזרים.
 * פונקציה טהורה: ה-cron (שלב 7) קורא כללים ויומן שליחות, שואל כאן "לשלוח?", ושולח דרך notify().
 */
import type { Channel } from "@/lib/services/notify";

export type RuleKind = "report_escalation" | "student_inactivity" | "coordinator_digest";

export type Rule = {
  enabled: boolean;
  firstAfterDays: number;
  maxSends: number;
  repeatEveryDays: number;
  channels: Channel[];
  copyManager: boolean;
};

/** ברירות מחדל לארגון חדש (PRD: הסלמה אחרי 7 ימים, פעם אחת; סטודנט שלא דיווח 3 שבועות) */
export const DEFAULT_RULES: Record<RuleKind, Rule> = {
  report_escalation: {
    enabled: true,
    firstAfterDays: 7,
    maxSends: 1,
    repeatEveryDays: 7,
    channels: ["email"],
    copyManager: true,
  },
  student_inactivity: {
    enabled: true,
    firstAfterDays: 21,
    maxSends: 1,
    repeatEveryDays: 7,
    channels: ["email"],
    copyManager: false,
  },
  /** סיכום יומי לרכז על דיווחים ממתינים. רק מתג וערוצים; הימים והמספרים לא רלוונטיים */
  coordinator_digest: {
    enabled: true,
    firstAfterDays: 0,
    maxSends: 1,
    repeatEveryDays: 1,
    channels: ["email"],
    copyManager: false,
  },
};

const DAY_MS = 86_400_000;
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);

export type SendDecision = {
  send: boolean;
  reason: "disabled" | "max_reached" | "too_early" | "repeat_wait" | "due";
  /** מתי ההתראה הבאה אמורה להישלח (null אם כבויה או שהגיעה למקסימום) */
  dueAt: Date | null;
};

/**
 * @param triggeredAt האירוע שמתחיל את הספירה (הגשת הדיווח, או הדיווח האחרון של הסטודנט)
 * @param sentCount כמה פעמים כבר נשלחה לרשומה הזו (מתוך notification_log, רק שליחות שהצליחו)
 * @param lastSentAt מתי נשלחה האחרונה
 */
export function nextSendDecision(input: {
  rule: Rule;
  triggeredAt: Date;
  sentCount: number;
  lastSentAt: Date | null;
  now: Date;
}): SendDecision {
  const { rule, triggeredAt, sentCount, lastSentAt, now } = input;
  if (!rule.enabled) return { send: false, reason: "disabled", dueAt: null };
  if (sentCount >= rule.maxSends) return { send: false, reason: "max_reached", dueAt: null };

  const first = sentCount === 0 || !lastSentAt;
  const dueAt = first
    ? addDays(triggeredAt, rule.firstAfterDays)
    : addDays(lastSentAt, rule.repeatEveryDays);

  if (now.getTime() >= dueAt.getTime()) return { send: true, reason: "due", dueAt };
  return { send: false, reason: first ? "too_early" : "repeat_wait", dueAt };
}
