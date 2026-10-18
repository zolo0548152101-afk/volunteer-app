import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { formatDay } from "@/lib/date-format";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { listMyReports, myProgress } from "@/lib/services/reports";
import { Flash } from "@/components/flash";
import { ListView } from "@/components/list-view";

export default async function MyReports({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const [sp, t, actor, format] = await Promise.all([searchParams, getTranslations("myReports"), requireRole("student"), getFormatter()]);
  const [list, progress] = await Promise.all([listMyReports(db(), actor), myProgress(db(), actor)]);
  const search = (r: (typeof list)[number]) => [formatDay(format, r.volunteerDate), r.volunteerDate, r.reportType === "absence" ? t("absence") : r.placeName, t(`status.${r.status}`), r.reportedHours, r.coordinatorNotes].filter(Boolean).join(" ");
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
      {list.length > 0 && <ListView storageKey="student-reports" cards={(
        <ul className="mt-4 flex flex-col gap-2">
          {list.map((r) => (
            <li key={r.id} data-search={search(r)} className="rounded-xl border border-border p-3 text-sm">
              <p className="font-medium">{formatDay(format, r.volunteerDate)} · {r.reportType === "absence" ? t("absence") : r.placeName} · {t("hours", { n: r.reportedHours })}</p>
              <p>{t(`status.${r.status}`)}{r.status === "approved" && r.approvedHours !== r.reportedHours ? ` · ${t("approvedHours", { n: r.approvedHours })}` : ""}</p>
              {r.coordinatorNotes && (r.status === "rejected" || r.status === "needs_correction") && <p className="text-muted">{t("coordinatorNote", { note: r.coordinatorNotes })}</p>}
              {r.status !== "rejected" && <Link href={`/student/reports/${r.id}`} className="inline-flex min-h-11 items-center underline">{r.status === "needs_correction" ? t("fix") : t("edit")}</Link>}
              {r.attachment && <a href={`/api/reports/${r.id}/attachment`} target="_blank" rel="noreferrer" className="ms-4 inline-flex min-h-11 items-center underline">{t("attachment")}</a>}
            </li>
          ))}
        </ul>
      )} table={(
        <table className="w-full text-sm">
          <thead className="bg-paper text-xs text-ink-3"><tr>{(["date", "place", "reported", "approved", "status", "actions"] as const).map((k) => <th key={k} scope="col" className="px-3 py-2 text-start font-medium">{t(`col.${k}`)}</th>)}</tr></thead>
          <tbody className="divide-y divide-hairline">
            {list.map((r) => (
              <tr key={r.id} data-search={search(r)}>
                <td className="whitespace-nowrap px-3 py-2">{formatDay(format, r.volunteerDate)}</td>
                <td className="px-3 py-2">{r.reportType === "absence" ? t("absence") : r.placeName}</td>
                <td className="px-3 py-2 tabular-nums">{r.reportedHours}</td>
                <td className="px-3 py-2 tabular-nums">{r.status === "approved" ? r.approvedHours : "—"}</td>
                <td className="px-3 py-2">{t(`status.${r.status}`)}{r.coordinatorNotes && (r.status === "rejected" || r.status === "needs_correction") ? <span className="block text-xs text-muted">{r.coordinatorNotes}</span> : null}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {r.status !== "rejected" && <Link href={`/student/reports/${r.id}`} className="inline-flex min-h-8 items-center underline">{r.status === "needs_correction" ? t("fix") : t("edit")}</Link>}
                  {r.attachment && <a href={`/api/reports/${r.id}/attachment`} target="_blank" rel="noreferrer" className="ms-3 inline-flex min-h-8 items-center underline">{t("attachment")}</a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )} />}
      <Link href="/student" className="mt-6 inline-block underline">{t("back")}</Link>
    </main>
  );
}
