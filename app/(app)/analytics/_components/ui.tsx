import Link from "next/link";
import type { ReactNode } from "react";

/** אבני הבניין של לוח הבקרה: כרטיס, תג, כותרת. בלי לוגיקה. */
export const card = "rounded-2xl border border-hairline bg-card p-5 shadow-[0_1px_2px_rgba(10,10,10,.04),0_1px_1px_rgba(10,10,10,.02)] min-w-0";

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";
const tones: Record<Tone, { pill: string; dot: string }> = {
  ok: { pill: "bg-ok-bg text-ok-fg", dot: "bg-ok" },
  warn: { pill: "bg-warn-bg text-warn-fg", dot: "bg-warn" },
  bad: { pill: "bg-bad-bg text-bad-fg", dot: "bg-bad" },
  info: { pill: "bg-info-bg text-info-fg", dot: "bg-info" },
  neutral: { pill: "bg-paper text-ink-2", dot: "bg-ink-3" },
};

/** תג פסטל עם נקודה. המשמעות תמיד גם במילים, לא בצבע בלבד */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold tabular-nums ${tones[tone].pill}`}>
      <i aria-hidden="true" className={`inline-block size-1.5 rounded-full ${tones[tone].dot}`} />
      {children}
    </span>
  );
}

/** גיל דיווח ממתין → גוון: אדום מעל פי שניים מסף ההסלמה, כתום מעל הסף, אחרת ניטרלי */
export const ageTone = (days: number | null, escalationDays: number): Tone =>
  days === null ? "ok" : days >= escalationDays * 2 ? "bad" : days >= escalationDays ? "warn" : "neutral";

export function CardTitle({ id, children, action }: { id: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 id={id} className="flex items-center gap-2 text-base font-bold">
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-3"><circle cx="12" cy="12" r="9" strokeDasharray="2 3" /></svg>
        {children}
      </h2>
      {action}
    </div>
  );
}

/** עיגול עם אות ראשונה, צבע קבוע לפי המזהה */
const palette = ["bg-info", "bg-ok", "bg-[#d97757]", "bg-[#7b61ff]", "bg-[#0f8f8f]", "bg-[#b4532a]"];
export function Avatar({ id, name, size = 30 }: { id: string; name: string; size?: number }) {
  let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return <span aria-hidden="true" className={`grid flex-none place-items-center rounded-full text-xs font-bold text-white ${palette[h % palette.length]}`} style={{ width: size, height: size }}>{name.trim().charAt(0)}</span>;
}

export function LinkArrow({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="inline-flex min-h-11 items-center gap-1 text-sm text-info-fg hover:underline">{children}<span aria-hidden="true" className="rtl:rotate-180">→</span></Link>;
}
