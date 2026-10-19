import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { submitReportAction } from "@/lib/actions/reports";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { reportablePlacements } from "@/lib/services/reports";
import { listFields } from "@/lib/services/custom-fields";
import { CustomFields } from "@/components/custom-fields/custom-fields";
import { ReportForm } from "@/components/student/report-form";
import { ReportErrorBanner } from "@/components/student/report-error";

export default async function NewReport({ searchParams }: { searchParams: Promise<{ absence?: string; error?: string }> }) {
  const [sp, t, actor] = await Promise.all([searchParams, getTranslations("reportForm"), requireRole("student")]);
  const absence = sp.absence === "1";
  const pls = await reportablePlacements(db(), actor);
  const fields = await listFields(db(), actor, "report", "report_form");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
  return (
    <main className="mx-auto w-full max-w-4xl p-4 lg:p-8">
      <h1 className="text-xl font-semibold">{absence ? t("titleAbsence") : t("title")}</h1>
      <ReportErrorBanner code={sp.error} />
      {!absence && pls.length === 0 ? (
        <>
          <p className="mt-3 text-muted">{t("noPlacements")}</p>
          <Link href="/student/report?absence=1" className="mt-3 inline-flex min-h-11 items-center underline">{t("switchToAbsence")}</Link>
        </>
      ) : (
        <ReportForm placements={pls} absence={absence} action={submitReportAction} max="24" today={today} extra={fields.length > 0 ? <CustomFields fields={fields} values={{}} /> : null} />
      )}
      <Link href="/student/reports" className="mt-6 inline-flex min-h-11 items-center underline">{t("myReports")}</Link>
    </main>
  );
}
