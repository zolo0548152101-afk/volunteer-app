import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { formatDay } from "@/lib/date-format";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { listMyReports, myProgress } from "@/lib/services/reports";
import { Flash } from "@/components/flash";

export default async function MyReports({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const [sp, t, actor, format] = await Promise.all([searchParams, getTranslations("myReports"), requireRole("student"), getFormatter()]);
  const [list, progress] = await Promise.all([listMyReports(db(), actor), myProgress(db(), actor)]);
  return (
    <main className="mx-auto w-full max-w-2xl p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      {sp.sent && <Flash tone="status" className="mt-2 rounded-lg border border-ok/50 p-3 text-sm text-ok-fg">{t("sent")}</Flash>}
      <p className="mt-2 text-sm text-muted">{t("progress", { approved: progress.approved, pending: progress.pending })}</p>
      <div className="mt-3 flex gap-4">
        <Link href="/student/report" className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{t("newReport")}</Link>
        <Link href="/student/report?absence=1" className="rounded-lg border border-border px-4 py-2">{t("newAbsence")}</Link>
      </div>
      {list.length === 0 && <p className="mt-4 text-muted">{t("empty")}</p>}
      <ul className="mt-4 flex flex-col gap-2">
        {list.map((r) => (
          <li key={r.id} className="rounded-xl border border-border p-3 text-sm">
            <p className="font-medium">{formatDay(format, r.volunteerDate)} · {r.reportType === "absence" ? t("absence") : r.placeName} · {t("hours", { n: r.reportedHours })}</p>
            <p>{t(`status.${r.status}`)}{r.status === "approved" && r.approvedHours !== r.reportedHours ? ` · ${t("approvedHours", { n: r.approvedHours })}` : ""}</p>
            {r.coordinatorNotes && (r.status === "rejected" || r.status === "needs_correction") && <p className="text-muted">{t("coordinatorNote", { note: r.coordinatorNotes })}</p>}
            {r.status !== "rejected" && <Link href={`/student/reports/${r.id}`} className="inline-flex min-h-11 items-center underline">{r.status === "needs_correction" ? t("fix") : t("edit")}</Link>}
            {r.attachment && <a href={`/api/reports/${r.id}/attachment`} target="_blank" rel="noreferrer" className="ms-4 inline-flex min-h-11 items-center underline">{t("attachment")}</a>}
          </li>
        ))}
      </ul>
      <Link href="/student" className="mt-6 inline-block underline">{t("back")}</Link>
    </main>
  );
}
