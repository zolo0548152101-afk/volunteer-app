import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/login-form";
import { setLocale } from "@/lib/actions/locale";
import { devLoginEnabled } from "@/lib/dev-login";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; password?: string }> }) {
  const { next, password } = await searchParams;
  // בסביבת בדיקה כל הפניה לכניסה (יציאה, חיבור שפג) מגיעה לבחירת המשתמש; ?password=1 מציג את הטופס הרגיל
  if (devLoginEnabled() && !password) redirect("/dev-login");
  const t = await getTranslations();
  const locale = await getLocale();
  const otherLocale = locale === "he" ? "en" : "he";

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border p-6">
        <h1 className="text-2xl font-semibold">{t("app.name")}</h1>
        <p className="mt-1 text-sm text-muted">{t("app.tagline")}</p>

        <h2 className="mt-6 text-lg font-medium">{t("auth.loginTitle")}</h2>
        <LoginForm next={next} />

        <div className="mt-4 flex flex-col gap-2 text-sm">
          <a href="/forgot" className="underline">
            {t("auth.forgot")}
          </a>
          <a href="/register" className="underline">
            {t("auth.register")}
          </a>
        </div>

        <form action={setLocale} className="mt-6 border-t border-border pt-4">
          <input type="hidden" name="locale" value={otherLocale} />
          <button type="submit" className="text-sm underline" lang={otherLocale}>
            {otherLocale === "en" ? "English" : "עברית"}
          </button>
        </form>
        <a href="/accessibility" className="mt-3 inline-block text-sm underline">{t("a11y.title")}</a>
      </div>
    </main>
  );
}
