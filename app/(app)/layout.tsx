import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { logoutAction } from "@/lib/actions/auth";
import { setLocale } from "@/lib/actions/locale";
import { countPendingInbox } from "@/lib/services/reports";
import { ThemeToggle } from "@/components/theme-toggle";
import { BottomNav, TopNav, navFor } from "@/components/nav/app-nav";

/**
 * המעטפת של כל המסכים המחוברים: סרגל צד במחשב, כותרת דקה + ניווט תחתון בטלפון.
 * כולם מעל קנבס "נייר" אפרפר; התוכן עצמו הוא כרטיס לבן.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const [t, tApp, tA, tR, locale, pending] = await Promise.all([
    getTranslations("nav"), getTranslations("app"), getTranslations("a11y"), getTranslations("roles"), getLocale(),
    actor.roles.includes("coordinator") && !actor.roles.includes("manager") ? countPendingInbox(db(), actor) : Promise.resolve(0),
  ]);
  const groups = await navFor(actor, pending);
  const other = locale === "he" ? "en" : "he";
  const primaryRole = (["manager", "coordinator", "interviewer", "student"] as const).find((r) => actor.roles.includes(r)) ?? "student";

  const tools = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <ThemeToggle />
      <form action={logoutAction}><button type="submit" className="min-h-11 rounded-full border border-white/40 px-4 hover:bg-white/10">{t("logout")}</button></form>
      <Link href="/accessibility" className="inline-flex min-h-11 items-center underline">{tA("title")}</Link>
      <form action={setLocale}>
        <input type="hidden" name="locale" value={other} />
        <button type="submit" className="min-h-11 underline" lang={other}>{other === "en" ? "English" : "עברית"}</button>
      </form>
    </div>
  );

  return (
    <div className="app-navy flex min-h-dvh flex-1 flex-col">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-card focus:p-2 focus:underline">{t("skipToContent")}</a>

      <TopNav groups={groups} appName={tApp("name")} userName={actor.name} roleName={tR(primaryRole)} label={t("mainNav")}>{tools}</TopNav>

      <header className="flex items-center justify-between px-4 py-2 text-white lg:hidden">
        <Link href="/" className="inline-flex min-h-11 items-center font-semibold">{tApp("name")}</Link>
        <form action={logoutAction}><button type="submit" className="min-h-10 rounded-full border border-white/40 px-4 text-sm">{t("logout")}</button></form>
      </header>
      <div className="flex min-w-0 flex-1 flex-col rounded-t-3xl bg-paper lg:mx-4">
        <div id="content" tabIndex={-1} className="flex flex-1 flex-col outline-none">{children}</div>
        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-hairline bg-card px-4 py-1 text-sm lg:hidden">
          <ThemeToggle />
          <Link href="/accessibility" className="inline-flex min-h-11 items-center underline">{tA("title")}</Link>
          <form action={setLocale}>
            <input type="hidden" name="locale" value={other} />
            <button type="submit" className="min-h-11 underline" lang={other}>{other === "en" ? "English" : "עברית"}</button>
          </form>
        </footer>
      </div>
      <BottomNav groups={groups} label={t("bottomNav")} moreLabel={t("more")} />
    </div>
  );
}
