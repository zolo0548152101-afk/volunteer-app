"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** קישור ניווט שמסמן את העמוד הנוכחי (aria-current), כולל עמודי משנה אלא אם exact */
export function NavLink({ href, exact, className, activeClassName, children }: { href: string; exact?: boolean; className: string; activeClassName: string; children: ReactNode }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + "/");
  return <Link href={href} aria-current={active ? "page" : undefined} className={`${className} ${active ? activeClassName : ""}`}>{children}</Link>;
}
