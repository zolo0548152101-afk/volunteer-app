import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { formatDay } from "@/lib/date-format";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { listMyReports, myProgress } from "@/lib/services/reports";
import { Flash } from "@/components/flash";
import { ListView } from "@/components/list-view";
import { PageHeader } from "@/components/page-header";
import { dt, Th } from "@/components/data-table";

export default async function MyReports({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const [sp, t, tn, actor, format] = await Promise.all([searchParams, getTranslations("myReports"), getTranslations("nav"), requireRole("student"), getFormatter()]);
  const [list, progress] = await Promise.all([listMyReports(db(), actor), myProgress(db(), actor)]);
  const tone = { approved: "bg-ok-bg text-ok-fg", pending: "bg-warn-bg text-warn-fg", needs_correction: "bg-warn-bg text-warn-fg", rejected: "bg-bad-bg text-bad-fg" } as const;
  const badge = (st: (typeof list)[number]["status"]) => <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone[st]}`}>{t(`status.${st}`)}</span>;
  const search = (r: (typeof list)[number]) => [formatDay(format, r.volunteerDate), r.volunteerDate, r.reportType === "absence" ? t("absence") : r.placeName, t(`status.${r.status}`), r.reportedHours, r.coordinatorNotes].filter(Boolean).join(" ");
  return (
    <main className="mx-auto w-full max-w-4xl p-4 lg:p-8">
      <PageHeader crumbs={[{ label: tn("home"), href: "/student" }]} current={t("title")} />
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      {sp.sent && <Flash tone="status" className="mt-2 rounded-lg border border-ok/50 p-3 text-sm text-ok-fg">{t("sent")}</Flash>}
      <p className="mt-2 text-sm text-muted">{t("progress", { approved: progress.approved, pending: progress.pending })}</p>
      <div className="mt-3 flex gap-4">
        <Link href="/student/report" className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{t("newReport")}</Link>
        <Link href="/student/report?absence=1" className="rounded-lg border border-border px-4 py-2">{t("newAbsence")}</Link>
      </div>
      {list.length === 0 && <p className="mt-4 text-muted">{t("empty")}</p>}
      {list.length > 0 && <ListView storageKey="student-reports" placeholder={t("searchPlaceholder")} cards={(
        <ul className="mt-4 flex flex-col gap-2">
          {list.map((r) => (
            <li key={r.id} data-search={search(r)} className="rounded-xl border border-border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{formatDay(format, r.volunteerDate)} · {r.reportType === "absence" ? t("absence") : r.placeName} · {t("hours", { n: r.reportedHours })}</p>
                {badge(r.status)}
              </div>
              {r.status === "approved" && r.approvedHours !== r.reportedHours && <p>{t("approvedHours", { n: r.approvedHours })}</p>}
              {r.coordinatorNotes && (r.status === "rejected" || r.status === "needs_correction") && <p className="text-muted">{t("coordinatorNote", { note: r.coordinatorNotes })}</p>}
              {r.status !== "rejected" && <Link href={`/student/reports/${r.id}`} className="inline-flex min-h-11 items-center underline">{r.status === "needs_correction" ? t("fix") : t("edit")}</Link>}
              {r.attachment && <a href={`/api/reports/${r.id}/attachment`} target="_blank" rel="noreferrer" className="ms-4 inline-flex min-h-11 items-center underline">{t("attachment")}</a>}
            </li>
          ))}
        </ul>
      )} table={(
        <table className={dt.table}>
          <thead className={dt.head}><tr><Th sort="text">{t("col.date")}</Th><Th sort="text">{t("col.place")}</Th><Th sort="num" num>{t("col.reported")}</Th><Th sort="num" num>{t("col.approved")}</Th><Th sort="text">{t("col.status")}</Th><Th>{t("col.actions")}</Th></tr></thead>
          <tbody className={dt.body}>
            {list.map((r) => (
              <tr key={r.id} data-search={search(r)}>
                <td className={`${dt.td} whitespace-nowrap`} data-v={r.volunteerDate}>{formatDay(format, r.volunteerDate)}</td>
                <td className={dt.td}>{r.reportType === "absence" ? t("absence") : r.placeName}</td>
                <td className={dt.num}>{r.reportedHours}</td>
                <td className={dt.num}>{r.status === "approved" ? r.approvedHours : "—"}</td>
                <td className={dt.td}>{badge(r.status)}{r.coordinatorNotes && (r.status === "rejected" || r.status === "needs_correction") ? <span className="mt-1 block text-xs text-muted">{r.coordinatorNotes}</span> : null}</td>
                <td className={dt.actions}>
                  {r.status !== "rejected" && <Link href={`/student/reports/${r.id}`} className="inline-flex min-h-11 items-center underline md:min-h-8">{r.status === "needs_correction" ? t("fix") : t("edit")}</Link>}
                  {r.attachment && <a href={`/api/reports/${r.id}/attachment`} target="_blank" rel="noreferrer" className="ms-3 inline-flex min-h-11 items-center underline md:min-h-8">{t("attachment")}</a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )} />}
    </main>
  );
}
