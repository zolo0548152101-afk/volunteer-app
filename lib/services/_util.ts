/** עזרים קטנים ששירותים חולקים (פעם אחת במקום עותק בכל קובץ) */

/** מחרוזת בלי רווחים בקצוות, או null כשהיא ריקה */
export const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null);

/** התאריך של היום לפי שעון ישראל, בפורמט YYYY-MM-DD */
export const todayIL = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });

/** תאריך בפורמט YYYY-MM-DD שקיים בלוח */
export const isDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; // 2026-02-30 מתגלגל ל-03-02, לכן משווים חזרה
};

/** מזהה לטיני קצר משם (למפתחות של שדות מותאמים ורשימות) */
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
