"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * הודעת תוצאה אחרי פעולה (redirect עם ?error / ?saved). הודעה שכבר קיימת ב-HTML הראשוני לא מוכרזת
 * לקורא מסך, ולכן ההודעה מקבלת פוקוס כשהיא עולה: הקורא מקריא אותה, ומי שרואה מגיע אליה.
 */
export function Flash({ tone, className, children }: { tone: "error" | "status"; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return <p ref={ref} role={tone === "error" ? "alert" : "status"} tabIndex={-1} className={`${className ?? ""} outline-none focus-visible:ring-2 focus-visible:ring-primary`}>{children}</p>;
}
