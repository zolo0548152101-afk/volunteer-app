import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { logoutAction } from "@/lib/actions/auth";
import { setLocale } from "@/lib/actions/locale";
import { countPendingInbox } from "@/lib/services/reports";
import { listAwaitingInterview } from "@/lib/services/students";
import { UserMenu } from "@/components/nav/user-menu";
import { Toaster } from "@/components/toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { BottomNav, TopNav, navFor } from "@/components/nav/app-nav";

/**
 * המעטפת של כל המסכים המחוברים: סרגל צד במחשב, כותרת דקה + ניווט תחתון בטלפון.
 * כולם מעל קנבס "נייר" אפרפר; התוכן עצמו הוא כרטיס לבן.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const isManager = actor.roles.includes("manager");
  const [t, tApp, tA, tR, locale, pending, awaiting] = await Promise.all([
    getTranslations("nav"), getTranslations("app"), getTranslations("a11y"), getTranslations("roles"), getLocale(),
    actor.roles.includes("coordinator") && !isManager ? countPendingInbox(db(), actor) : Promise.resolve(0),
    actor.roles.includes("interviewer") && !isManager && !actor.roles.includes("coordinator") ? listAwaitingInterview(db(), actor).then((l) => l.length) : Promise.resolve(0),
  ]);
  const groups = await navFor(actor, pending, awaiting);
  const other = locale === "he" ? "en" : "he";
  const primaryRole = (["manager", "coordinator", "interviewer", "student"] as const).find((r) => actor.roles.includes(r)) ?? "student";
  const item = "flex min-h-11 w-full items-center rounded-lg px-3 text-sm text-ink-2 hover:bg-paper";

  // תפריט משתמש אחד: תצוגה, שפה, נגישות, ו"יציאה" מופרדת בקו. כך אין שורת כלים בכל מסך
  const userMenu = (
    <UserMenu name={actor.name} role={tR(primaryRole)} label={t("userMenu")}>
      <div className="flex flex-col gap-1">
        <div className="px-3 py-2"><ThemeToggle /></div>
        <form action={setLocale}>
          <input type="hidden" name="locale" value={other} />
          <button type="submit" className={item} lang={other}>{other === "en" ? "English" : "עברית"}</button>
        </form>
        <Link href="/accessibility" className={item}>{tA("title")}</Link>
        <hr className="my-1 border-hairline" />
        <form action={logoutAction}><button type="submit" className={`${item} font-medium text-bad-fg hover:bg-bad-bg`}>{t("logout")}</button></form>
      </div>
    </UserMenu>
  );

  return (
    <div className="app-navy flex min-h-dvh flex-1 flex-col">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-card focus:p-2 focus:underline">{t("skipToContent")}</a>

      <TopNav groups={groups} appName={tApp("name")} label={t("mainNav")} adminLabel={t("admin")}>{userMenu}</TopNav>

      <header className="flex items-center justify-between px-4 py-2 text-white lg:hidden">
        <Link href="/" className="inline-flex min-h-11 items-center font-semibold">{tApp("name")}</Link>
        {userMenu}
      </header>
      <div className="flex min-w-0 flex-1 flex-col rounded-t-3xl bg-paper lg:mx-4">
        <div id="content" tabIndex={-1} className="flex flex-1 flex-col outline-none">{children}</div>
      </div>
      <Toaster />
      <BottomNav groups={groups} label={t("bottomNav")} moreLabel={t("more")} />
    </div>
  );
}
