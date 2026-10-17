import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/permissions";
import { MoreMenu } from "./more-menu";
import { NavLink } from "./nav-link";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; count?: number; exact?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

export const ICONS = {
  dashboard: "M4 4h6v8H4zM14 4h6v5h-6zM14 13h6v7h-6zM4 16h6v4H4z",
  reports: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2",
  students: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0",
  places: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6",
  queue: "M8 7h8M8 12h8M8 17h5M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
  report: "M12 5v14M5 12h14",
  profile: "M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1l-.4-2.6H9.2l-.4 2.6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.4 2.6h5.6l.4-2.6a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1Z",
  fields: "M4 6h16M4 12h10M4 18h7",
  users: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm-12 10a8 8 0 0 1 16 0M19 8a3 3 0 1 0 0-6",
};

/** פריטי התפריט לפי תפקיד. הקבוצה הראשונה היא גם הניווט התחתון בטלפון (עד 5) */
export async function navFor(actor: SessionUser, pending: number): Promise<NavGroup[]> {
  const t = await getTranslations("nav");
  const r = actor.roles;
  if (r.includes("manager")) {
    return [
      { label: t("groupMain"), items: [
        { href: "/manager", label: t("dashboard"), icon: "dashboard", exact: true },
        { href: "/reports", label: t("inbox"), icon: "reports", count: pending },
        { href: "/students", label: t("students"), icon: "students" },
        { href: "/places", label: t("places"), icon: "places" },
        { href: "/interviewer", label: t("queue"), icon: "queue" },
        { href: "/manager/users", label: t("users"), icon: "users" },
        { href: "/manager/custom-fields", label: t("customFields"), icon: "fields" },
      ] },
      { label: t("groupSettings"), items: [
        { href: "/manager/settings", label: t("settings"), icon: "settings" },
      ] },
    ];
  }
  if (r.includes("coordinator")) {
    return [{ label: t("groupMain"), items: [
      { href: "/coordinator", label: t("dashboard"), icon: "dashboard", exact: true },
      { href: "/reports", label: t("inbox"), icon: "reports", count: pending },
      { href: "/students", label: t("students"), icon: "students" },
      { href: "/places", label: t("places"), icon: "places" },
    ] }];
  }
  if (r.includes("interviewer")) {
    return [{ label: t("groupMain"), items: [
      { href: "/interviewer", label: t("queue"), icon: "queue" },
      { href: "/students", label: t("students"), icon: "students" },
      { href: "/places", label: t("places"), icon: "places" },
    ] }];
  }
  return [{ label: t("groupMe"), items: [
    { href: "/student", label: t("home"), icon: "dashboard", exact: true },
    { href: "/student/report", label: t("report"), icon: "report" },
    { href: "/student/reports", label: t("reports"), icon: "reports" },
    { href: "/places", label: t("places"), icon: "places" },
    { href: "/student/profile", label: t("profile"), icon: "profile" },
  ] }];
}

export function Icon({ name, size = 18 }: { name: keyof typeof ICONS; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name]} /></svg>;
}

/** סרגל צד למחשב (מוסתר בטלפון) */
export function Sidebar({ groups, appName, userName, roleName, label, children }: { groups: NavGroup[]; appName: string; userName: string; roleName: string; label: string; children: ReactNode }) {
  return (
    <aside className="hidden w-56 flex-none flex-col gap-5 overflow-y-auto border-e border-hairline bg-card p-3 lg:sticky lg:top-0 lg:flex lg:h-dvh">
      <Link href="/" className="flex items-center gap-2.5 px-1.5">
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-info text-xs font-bold text-white">{appName.slice(0, 2)}</span>
        <span className="text-[15px] font-bold">{appName}</span>
      </Link>
      <nav aria-label={label} className="flex flex-col gap-6">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-0.5">
            <p className="mb-1.5 px-3 text-[11px] tracking-wider text-ink-3">{g.label}</p>
            {g.items.map((it) => (
              <NavLink key={it.href} href={it.href} exact={it.exact} className="flex min-h-10 items-center justify-between rounded-lg px-3 text-sm text-ink-2 transition-colors duration-150 hover:bg-paper hover:text-ink" activeClassName="bg-info-bg font-semibold text-info-fg">
                <span className="flex items-center gap-2.5"><Icon name={it.icon} size={16} />{it.label}</span>
                {it.count ? <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold tabular-nums text-warn-fg">{it.count}</span> : null}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2 border-t border-hairline pt-3">
        <div className="flex items-center gap-2.5 px-1.5">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-[#d97757] text-xs font-bold text-white">{userName.charAt(0)}</span>
          <span className="flex min-w-0 flex-col"><span className="truncate text-[13px] font-semibold">{userName}</span><span className="text-xs text-ink-3">{roleName}</span></span>
        </div>
        {children}
      </div>
    </aside>
  );
}

/** ניווט תחתון לטלפון: עד 5 פריטים. כשיש יותר, 4 הראשונים + "עוד" עם כל השאר (גם הקבוצות האחרות) */
export function BottomNav({ groups, label, moreLabel }: { groups: NavGroup[]; label: string; moreLabel: string }) {
  const all = groups.flatMap((g) => g.items);
  const needsMore = all.length > 5;
  const shown = needsMore ? groups[0].items.slice(0, 4) : all;
  const rest: NavGroup[] = needsMore
    ? [{ label: groups[0].label, items: groups[0].items.slice(4) }, ...groups.slice(1)].filter((g) => g.items.length > 0)
    : [];
  return (
    <nav aria-label={label} className="sticky bottom-0 z-40 flex border-t border-hairline bg-card px-2 pb-2.5 pt-1.5 lg:hidden">
      {shown.map((it) => (
        <NavLink key={it.href} href={it.href} exact={it.exact} className="relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-ink-3" activeClassName="font-semibold text-ink">
          <Icon name={it.icon} size={20} />
          {it.label}
          {it.count ? <span className="absolute top-0 inline-flex min-w-4 justify-center rounded-full bg-warn-bg px-1 text-[10px] font-bold text-warn-fg" style={{ insetInlineEnd: "18%" }}>{it.count}</span> : null}
        </NavLink>
      ))}
      {needsMore && <MoreMenu groups={rest} label={moreLabel} />}
    </nav>
  );
}
