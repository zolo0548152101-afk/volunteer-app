"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Popover } from "./popover";

/** תפריט "ניהול ▾" במחשב: פריטי ניהול המערכת. מסומן כפעיל כשנמצאים באחד מהמסכים שלו */
export function NavMenu({ label, items, triggerClassName }: { label: string; items: { href: string; label: string; icon: ReactNode }[]; triggerClassName: string }) {
  const path = usePathname();
  const active = items.some((i) => path === i.href || path.startsWith(i.href + "/"));
  return (
    <Popover label={label} active={active} panelClassName="w-56"
      triggerClassName={`${triggerClassName} ${active ? "!bg-white/25 font-semibold !text-white ring-1 ring-white/40" : ""}`}
      trigger={<>{label}<span aria-hidden="true">▾</span></>}>
      <ul className="flex flex-col gap-0.5">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} aria-current={path === i.href || path.startsWith(i.href + "/") ? "page" : undefined}
              className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm text-ink-2 hover:bg-paper aria-[current=page]:bg-paper aria-[current=page]:font-semibold aria-[current=page]:text-ink">{i.icon}{i.label}</Link>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
