import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { submitReportAction } from "@/lib/actions/reports";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { reportablePlacements } from "@/lib/services/reports";
import { ReportForm } from "@/components/student/report-form";
import { ReportErrorBanner } from "@/components/student/report-error";

export default async function NewReport({ searchParams }: { searchParams: Promise<{ absence?: string; error?: string }> }) {
  const [sp, t, actor] = await Promise.all([searchParams, getTranslations("reportForm"), requireRole("student")]);
  const absence = sp.absence === "1";
  const pls = await reportablePlacements(db(), actor);
  return (
    <main className="mx-auto w-full max-w-xl p-4">
      <h1 className="text-xl font-semibold">{absence ? t("titleAbsence") : t("title")}</h1>
      <ReportErrorBanner code={sp.error} />
      {!absence && pls.length === 0 ? (
        <p className="mt-3 text-muted">{t("noPlacements")}</p>
      ) : (
        <ReportForm placements={pls} absence={absence} action={submitReportAction} max="24" />
      )}
      <Link href={absence ? "/student/report" : "/student/report?absence=1"} className="mt-6 inline-block underline">{absence ? t("switchToVolunteer") : t("switchToAbsence")}</Link>
      <Link href="/student/reports" className="ms-4 mt-6 inline-block underline">{t("myReports")}</Link>
    </main>
  );
}
