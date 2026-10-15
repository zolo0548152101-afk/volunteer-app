import { getLocale, getTranslations } from "next-intl/server";
import { setLocale } from "@/lib/actions/locale";

// בשלב 0 זה מסך בלבד. ההתחברות בפועל (Auth.js) נכנסת בשלב 2.
export default async function LoginPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const otherLocale = locale === "he" ? "en" : "he";

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border p-6">
        <h1 className="text-2xl font-semibold">{t("app.name")}</h1>
        <p className="mt-1 text-sm text-muted">{t("app.tagline")}</p>

        <h2 className="mt-6 text-lg font-medium">{t("auth.loginTitle")}</h2>
        <form className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            {t("auth.email")}
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              className="rounded-lg border border-border bg-transparent px-3 py-2 text-base"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("auth.password")}
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              className="rounded-lg border border-border bg-transparent px-3 py-2 text-base"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground"
          >
            {t("auth.submit")}
          </button>
        </form>

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
      </div>
    </main>
  );
}
