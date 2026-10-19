import type { ReactNode } from "react";

/**
 * סגנון טבלה אחד לכל המערכת (T6): כותרת, שורה, תא רגיל, תא מספרי (מיושר לסוף, ספרות קבועות) ותא פעולות.
 * מיון: `sort="text" | "num"` על הכותרת; ListView מטפל בלחיצה ובחץ (aria-sort).
 * בתא ממוין אפשר לתת `data-v` כשהערך למיון שונה מהטקסט המוצג (למשל תאריך ISO).
 */
export const dt = {
  table: "w-full text-sm",
  head: "bg-paper text-xs text-ink-3",
  body: "divide-y divide-hairline",
  th: "px-3 py-2 text-start font-medium",
  thNum: "px-3 py-2 text-end font-medium",
  td: "px-3 py-2",
  num: "px-3 py-2 text-end tabular-nums",
  actions: "whitespace-nowrap px-3 py-2",
} as const;

export function Th({ children, sort, num, className = "" }: { children: ReactNode; sort?: "text" | "num"; num?: boolean; className?: string }) {
  return <th scope="col" data-sort={sort} aria-sort={sort ? "none" : undefined} className={`${num ? dt.thNum : dt.th} ${className}`}>{children}</th>;
}
