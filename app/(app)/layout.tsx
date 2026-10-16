import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireActor } from "@/lib/session";
import { logoutAction } from "@/lib/actions/auth";
import { setLocale } from "@/lib/actions/locale";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireActor();
  const [t, tApp, tA, locale] = await Promise.all([getTranslations("nav"), getTranslations("app"), getTranslations("a11y"), getLocale()]);
  const other = locale === "he" ? "en" : "he";
  return (
    <div className="flex flex-1 flex-col">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-background focus:p-2 focus:underline">{t("skipToContent")}</a>
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <Link href="/" className="font-semibold">{tApp("name")}</Link>
        <form action={logoutAction}>
          <button type="submit" className="text-sm underline">{t("logout")}</button>
        </form>
      </header>
      <div id="content" tabIndex={-1} className="flex flex-1 flex-col outline-none">{children}</div>
      <footer className="flex items-center justify-between gap-4 border-t border-border px-4 py-2 text-sm">
        <Link href="/accessibility" className="underline">{tA("title")}</Link>
        <form action={setLocale}>
          <input type="hidden" name="locale" value={other} />
          <button type="submit" className="underline" lang={other}>{other === "en" ? "English" : "עברית"}</button>
        </form>
      </footer>
    </div>
  );
}
