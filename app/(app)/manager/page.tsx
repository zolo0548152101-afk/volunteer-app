import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { requireRole } from "@/lib/session";

export default async function Page() {
  const [t, actor] = await Promise.all([getTranslations(), requireRole("manager")]);
  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">{t("roles.manager")}</h1>
      <p className="mt-2 text-muted">{actor.name}</p>
      <Link href="/places" className="me-4 mt-4 inline-block underline">{t("nav.places")}</Link>
      <Link href="/manager/users" className="mt-4 inline-block underline">{t("nav.users")}</Link>
    </main>
  );
}
