"use client";
import type { ReactNode } from "react";
import { Popover } from "./popover";

/** תפריט משתמש: השם והעיגול פותחים תצוגה, שפה, נגישות, ו"יציאה" בתחתית מופרדת בקו */
export function UserMenu({ name, role, label, children }: { name: string; role: string; label: string; children: ReactNode }) {
  return (
    <Popover label={label} hiddenLabel panelClassName="w-72"
      triggerClassName="inline-flex min-h-11 items-center gap-2.5 rounded-full bg-white/10 py-1 ps-1 pe-3 text-sm text-white hover:bg-white/20"
      trigger={<>
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-[#d97757] text-xs font-bold text-white">{name.charAt(0)}</span>
        <span className="hidden text-start sm:block"><span className="block font-semibold leading-tight">{name}</span><span className="block text-xs leading-tight text-white/70">{role}</span></span>
        <span aria-hidden="true" className="text-xs">▾</span>
      </>}>
      {children}
    </Popover>
  );
}
