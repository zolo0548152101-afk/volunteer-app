import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { requireRole } from "@/lib/session";

export default async function Page() {
  const [t, actor] = await Promise.all([getTranslations(), requireRole("coordinator")]);
  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">{t("roles.coordinator")}</h1>
      <p className="mt-2 text-muted">{actor.name}</p>
      <nav className="mt-4 flex flex-col gap-2">
        <Link href="/reports" className="underline">{t("nav2.reports")}</Link>
        <Link href="/students" className="underline">{t("nav2.students")}</Link>
        <Link href="/places" className="underline">{t("nav.places")}</Link>
      </nav>
    </main>
  );
}
