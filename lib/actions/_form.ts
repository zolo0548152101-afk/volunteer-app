/** עזרי FormData משותפים לפעולות השרת (קובץ רגיל, לא "use server": אפשר לייבא ממנו מכל קובץ פעולות) */

/** הערך כמחרוזת, כמו שהוזן */
export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
/** הערך כמחרוזת בלי רווחים בקצוות */
export const trimmed = (fd: FormData, k: string) => str(fd, k).trim();
/** מספר מהטופס; שדה ריק או לא מספרי = NaN (השירות דוחה) */
export const num = (fd: FormData, k: string) => (trimmed(fd, k) === "" ? NaN : Number(trimmed(fd, k)));
/** מספר או null כשהשדה ריק */
export const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
