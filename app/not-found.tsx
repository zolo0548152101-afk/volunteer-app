import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main id="content" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 p-6">
      <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
      <p>{t("notFoundBody")}</p>
      <Link href="/" className="mt-2 inline-flex min-h-11 items-center self-start underline">{t("home")}</Link>
    </main>
  );
}
