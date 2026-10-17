"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Icon, type NavGroup } from "./app-nav";

/** הפריט החמישי בניווט התחתון בטלפון: פותח את שאר המסכים (למנהל: הגדרות, משתמשים, שדות מותאמים) */
export function MoreMenu({ groups, label }: { groups: NavGroup[]; label: string }) {
  // "פתוח" נשמר יחד עם הנתיב: מעבר עמוד סוגר את התפריט בלי אפקט
  const [openAt, setOpenAt] = useState<string | null>(null);
  const path = usePathname();
  const open = openAt === path;
  
  const panel = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const active = groups.some((g) => g.items.some((it) => path === it.href || path.startsWith(it.href + "/")));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpenAt(null); btn.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative flex flex-1">
      <button ref={btn} type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpenAt(open ? null : path)}
        className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${active || open ? "font-semibold text-ink" : "text-ink-3"}`}>
        <svg aria-hidden="true" width={20} height={20} viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
        {label}
      </button>
      {open && (
        <div id={panel} className="absolute bottom-full end-0 mb-2 flex w-60 flex-col gap-3 rounded-xl border border-hairline bg-card p-3 shadow-lg">
          {groups.map((g, gi) => (
            <div key={`${g.label}-${gi}`} className="flex flex-col gap-0.5">
              <p className="px-2 text-[11px] tracking-wider text-ink-3">{g.label}</p>
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} aria-current={path === it.href || path.startsWith(it.href + "/") ? "page" : undefined}
                  className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-sm text-ink-2 hover:bg-paper aria-[current=page]:bg-paper aria-[current=page]:font-semibold aria-[current=page]:text-ink">
                  <Icon name={it.icon} size={16} />{it.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
