/** תאריך ברירת המחדל לדיווח: יום החוזה האחרון שכבר התקיים (היום, אם היום הוא יום חוזה). */
const KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * @param days ימי החוזה (sun..fri)
 * @param today תאריך "YYYY-MM-DD" לפי שעון ישראל
 * בלי ימים בחוזה, או כשאין יום חוזה בשבוע האחרון: היום.
 */
export function lastContractDay(days: readonly string[], today: string): string {
  if (days.length === 0) return today;
  const base = new Date(`${today}T00:00:00Z`);
  for (let back = 0; back < 7; back++) {
    const d = new Date(base.getTime() - back * 86_400_000);
    if (days.includes(KEYS[d.getUTCDay()])) return d.toISOString().slice(0, 10);
  }
  return today;
}
