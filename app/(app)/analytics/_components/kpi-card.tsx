import Link from "next/link";
import type { ReactNode } from "react";
import type { Tone } from "./ui";

const sub: Record<Tone, string> = { ok: "text-ok-fg", warn: "text-warn-fg", bad: "text-bad-fg", info: "text-info-fg", neutral: "text-ink-3" };

/** כרטיס מדד: כולו קישור, הטקסט המלא בפנים (לא רק המספר) */
export function KpiCard({ href, label, value, note, tone = "neutral", icon }: { href?: string; label: string; value: string | number; note?: string; tone?: Tone; icon: ReactNode }) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-[13px] text-ink-2">
        <span aria-hidden="true" className="grid size-7 place-items-center rounded-lg border border-hairline bg-paper text-ink-2">{icon}</span>
        {label}
      </span>
      <span className="text-3xl font-bold leading-tight tabular-nums">{value}</span>
      {note && <span className={`text-xs ${sub[tone]}`}>{note}</span>}
    </>
  );
  const cls = "flex min-w-0 flex-col gap-2 rounded-xl border border-hairline bg-card px-4 py-3.5 shadow-[0_1px_2px_rgba(10,10,10,.04)] transition-colors duration-200";
  return href ? <Link href={href} className={`${cls} hover:border-ink-3 focus-visible:border-ink-3`}>{body}</Link> : <div className={cls}>{body}</div>;
}
