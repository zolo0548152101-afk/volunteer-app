import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { requireRole } from "@/lib/session";

export default async function Page() {
  const [t, actor] = await Promise.all([getTranslations(), requireRole("student")]);
  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">{t("roles.student")}</h1>
      <p className="mt-2 text-muted">{actor.name}</p>
      <p className="mt-2 text-muted">{t("common.comingSoon")}</p>
    <Link href="/places" className="mt-4 inline-block underline">{t("nav.places")}</Link>
    </main>
  );
}
