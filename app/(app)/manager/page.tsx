import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { requireRole } from "@/lib/session";

export default async function Page() {
  const [t, actor] = await Promise.all([getTranslations(), requireRole("manager")]);
  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">{t("roles.manager")}</h1>
      <p className="mt-2 text-muted">{actor.name}</p>
      <Link href="/reports" className="me-4 mt-4 inline-block underline">{t("nav2.reports")}</Link>
      <Link href="/students" className="me-4 mt-4 inline-block underline">{t("nav2.students")}</Link>
      <Link href="/places" className="me-4 mt-4 inline-block underline">{t("nav.places")}</Link>
      <Link href="/manager/settings" className="me-4 mt-4 inline-block underline">{t("nav3.settings")}</Link>
      <Link href="/manager/custom-fields" className="me-4 mt-4 inline-block underline">{t("customFieldsAdmin.title")}</Link>
      <Link href="/manager/users" className="mt-4 inline-block underline">{t("nav.users")}</Link>
    </main>
  );
}
