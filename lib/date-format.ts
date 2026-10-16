import type { getFormatter } from "next-intl/server";

type Fmt = Awaited<ReturnType<typeof getFormatter>>;

/** תאריך יום ("YYYY-MM-DD", בלי שעה) בפורמט המקומי של המשתמש. UTC כדי שלא יזוז יום לפי אזור הזמן. */
export const formatDay = (format: Fmt, day: string) => format.dateTime(new Date(`${day}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

/** רגע בזמן (timestamp) כתאריך לפי שעון ישראל */
export const formatInstant = (format: Fmt, at: Date) => format.dateTime(at, { dateStyle: "medium", timeZone: "Asia/Jerusalem" });
