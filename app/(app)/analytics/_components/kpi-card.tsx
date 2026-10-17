import Link from "next/link";
import type { ReactNode } from "react";
import type { Tone } from "./ui";

const sub: Record<Tone, string> = { ok: "text-ok-fg", warn: "text-warn-fg", bad: "text-bad-fg", info: "text-info-fg", neutral: "text-ink-3" };
const edge: Record<Tone, string> = { ok: "border-s-ok", warn: "border-s-warn", bad: "border-s-bad", info: "border-s-info", neutral: "border-s-hairline" };

/** כרטיס מדד: כולו קישור. פס צבע בצד מסמן דחיפות, והמשמעות תמיד גם בטקסט */
export function KpiCard({ href, label, value, note, tone = "neutral", icon }: { href?: string; label: string; value: string | number; note?: string; tone?: Tone; icon?: ReactNode }) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-xs text-ink-2">{icon && <span aria-hidden="true" className="text-ink-3">{icon}</span>}{label}</span>
      <span className="text-3xl font-bold leading-none tabular-nums">{value}</span>
      {note && <span className={`text-xs ${sub[tone]}`}>{note}</span>}
    </>
  );
  const cls = `flex min-w-0 flex-col gap-1.5 rounded-xl border border-s-4 border-hairline bg-card px-4 py-3 transition-colors duration-150 ${edge[tone]}`;
  return href ? <Link href={href} className={`${cls} hover:bg-paper focus-visible:bg-paper`}>{body}</Link> : <div className={cls}>{body}</div>;
}
