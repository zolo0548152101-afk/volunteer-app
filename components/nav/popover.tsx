"use client";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * תפריט נפתח קטן (תפריט "ניהול", תפריט משתמש): נסגר ב-Esc, בלחיצה בחוץ ובמעבר עמוד.
 * "פתוח" נשמר יחד עם הנתיב, כך שמעבר עמוד סוגר אותו בלי אפקט.
 */
export function Popover({ trigger, label, triggerClassName, panelClassName, active, hiddenLabel, children }: {
  trigger: ReactNode; label: string; triggerClassName: string; panelClassName?: string; active?: boolean; children: ReactNode; hiddenLabel?: boolean;
}) {
  const [openAt, setOpenAt] = useState<string | null>(null);
  const path = usePathname();
  const open = openAt === path;
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpenAt(null); btn.current?.focus(); } };
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpenAt(null); };
    document.addEventListener("keydown", key); document.addEventListener("click", away);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("click", away); };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button ref={btn} type="button" aria-expanded={open} aria-controls={id} data-active={active ? "" : undefined} onClick={() => setOpenAt(open ? null : path)} className={triggerClassName}>{trigger}{hiddenLabel && <span className="sr-only">{label}</span>}</button>
      {open && <div id={id} className={`absolute end-0 top-full z-50 mt-2 ${panelClassName ?? "w-64"} rounded-xl border border-hairline bg-card p-2 text-ink shadow-lg`}>{children}</div>}
    </div>
  );
}
