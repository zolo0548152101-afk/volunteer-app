/** עזרים קטנים ששירותים חולקים (פעם אחת במקום עותק בכל קובץ) */

/** מחרוזת בלי רווחים בקצוות, או null כשהיא ריקה */
export const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null);

/** התאריך של היום לפי שעון ישראל, בפורמט YYYY-MM-DD */
export const todayIL = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });

/** תאריך בפורמט YYYY-MM-DD שקיים בלוח */
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** מזהה לטיני קצר משם (למפתחות של שדות מותאמים ורשימות) */
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
