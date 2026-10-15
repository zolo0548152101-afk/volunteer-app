import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { getMyProfile } from "@/lib/services/students";
import { myProgress } from "@/lib/services/reports";

export default async function Page() {
  const [t, actor] = await Promise.all([getTranslations(), requireRole("student")]);
  const p = await getMyProfile(db(), actor);
  if (!p.profileCompletedAt) redirect("/student/setup/1");
  const progress = await myProgress(db(), actor);
  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">{actor.name}</h1>
      <p className="mt-2 text-muted">{p.coordinatorName ? t("student.withCoordinator", { name: p.coordinatorName }) : t("student.waiting")}</p>
      <p className="mt-2 text-sm">{t("myReports.progress", { approved: progress.approved, pending: progress.pending })}</p>
      <nav className="mt-4 flex flex-col gap-2">
        <Link href="/student/report" className="underline">{t("nav2.reportHours")}</Link>
        <Link href="/student/reports" className="underline">{t("nav2.myReports")}</Link>
        <Link href="/student/profile" className="underline">{t("nav.profile")}</Link>
        <Link href="/places" className="underline">{t("nav.places")}</Link>
      </nav>
    </main>
  );
}
