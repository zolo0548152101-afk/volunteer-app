import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { logoutAction } from "@/lib/actions/auth";
import { setLocale } from "@/lib/actions/locale";
import { countPendingInbox } from "@/lib/services/reports";
import { BottomNav, Sidebar, navFor } from "@/components/nav/app-nav";

/**
 * המעטפת של כל המסכים המחוברים: סרגל צד במחשב, כותרת דקה + ניווט תחתון בטלפון.
 * כולם מעל קנבס "נייר" אפרפר; התוכן עצמו הוא כרטיס לבן.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const [t, tApp, tA, tR, locale, pending] = await Promise.all([
    getTranslations("nav"), getTranslations("app"), getTranslations("a11y"), getTranslations("roles"), getLocale(),
    actor.roles.some((r) => r === "manager" || r === "coordinator") ? countPendingInbox(db(), actor) : Promise.resolve(0),
  ]);
  const groups = await navFor(actor, pending);
  const other = locale === "he" ? "en" : "he";
  const primaryRole = (["manager", "coordinator", "interviewer", "student"] as const).find((r) => actor.roles.includes(r)) ?? "student";

  const tools = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <form action={logoutAction}><button type="submit" className="min-h-11 underline">{t("logout")}</button></form>
      <Link href="/accessibility" className="inline-flex min-h-11 items-center underline">{tA("title")}</Link>
      <form action={setLocale}>
        <input type="hidden" name="locale" value={other} />
        <button type="submit" className="min-h-11 underline" lang={other}>{other === "en" ? "English" : "עברית"}</button>
      </form>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col bg-paper lg:flex-row lg:gap-3 lg:p-3">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-card focus:p-2 focus:underline">{t("skipToContent")}</a>

      <Sidebar groups={groups} appName={tApp("name")} userName={actor.name} roleName={tR(primaryRole)} label={t("mainNav")}>{tools}</Sidebar>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col bg-card lg:min-h-0 lg:rounded-2xl lg:border lg:border-hairline">
        <header className="flex items-center justify-between border-b border-hairline bg-card px-4 py-2 lg:hidden">
          <Link href="/" className="inline-flex min-h-11 items-center font-semibold">{tApp("name")}</Link>
          <form action={logoutAction}><button type="submit" className="min-h-11 text-sm underline">{t("logout")}</button></form>
        </header>
        <div id="content" tabIndex={-1} className="flex flex-1 flex-col outline-none lg:rounded-2xl">{children}</div>
        <footer className="flex items-center justify-between gap-4 border-t border-hairline bg-card px-4 py-1 text-sm lg:hidden">
          <Link href="/accessibility" className="inline-flex min-h-11 items-center underline">{tA("title")}</Link>
          <form action={setLocale}>
            <input type="hidden" name="locale" value={other} />
            <button type="submit" className="min-h-11 underline" lang={other}>{other === "en" ? "English" : "עברית"}</button>
          </form>
        </footer>
        <BottomNav items={groups[0].items} label={t("bottomNav")} />
      </div>
    </div>
  );
}
