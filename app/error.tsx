"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("errors");
  return (
    <main id="content" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 p-6">
      <h1 className="text-2xl font-semibold">{t("errorTitle")}</h1>
      <p role="alert">{t("errorBody")}</p>
      <div className="mt-2 flex gap-4">
        <button type="button" onClick={() => retry()} className="min-h-11 rounded-lg bg-primary px-4 text-primary-foreground">{t("retry")}</button>
        <Link href="/" className="inline-flex min-h-11 items-center underline">{t("home")}</Link>
      </div>
    </main>
  );
}
