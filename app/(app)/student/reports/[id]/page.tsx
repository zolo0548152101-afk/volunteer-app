import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { resubmitReportAction } from "@/lib/actions/reports";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { getMyReport, reportablePlacements } from "@/lib/services/reports";
import { NotFoundError } from "@/lib/services/users";
import { listFields, loadValues } from "@/lib/services/custom-fields";
import { CustomFields } from "@/components/custom-fields/custom-fields";
import { ReportForm } from "@/components/student/report-form";
import { ReportErrorBanner } from "@/components/student/report-error";

export default async function EditReport({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, sp, t, actor] = await Promise.all([params, searchParams, getTranslations("reportForm"), requireRole("student")]);
  let report;
  try { report = await getMyReport(db(), actor, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const editable = report.status !== "rejected"; // אחרי אישור אפשר לערוך: הדיווח חוזר לאישור הרכז
  const fields = await listFields(db(), actor, "report", "report_form");
  const values = await loadValues(db(), actor.organizationId, id, fields);
  const pls = await reportablePlacements(db(), actor);
  return (
    <main className="mx-auto w-full max-w-xl p-4">
      <h1 className="text-xl font-semibold">{t("titleEdit")}</h1>
      {report.coordinatorNotes && report.status === "needs_correction" && <p className="mt-2 rounded-lg border border-warn/50 p-3 text-sm">{t("coordinatorAsked", { note: report.coordinatorNotes })}</p>}
      <ReportErrorBanner code={sp.error} />
      {editable ? <ReportForm placements={pls} absence={report.reportType === "absence"} report={report} action={resubmitReportAction} max="24" today={new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" })} extra={fields.length > 0 ? <CustomFields fields={fields} values={values} /> : null} /> : <p className="mt-3 text-muted">{t("locked")}</p>}
    </main>
  );
}
