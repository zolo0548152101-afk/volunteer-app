import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { decideAction } from "@/lib/actions/reports";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { listInbox, type ReportStatus } from "@/lib/services/reports";
import { ForbiddenError } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ReportErrorBanner } from "@/components/student/report-error";

const STATUSES: ReportStatus[] = ["pending", "needs_correction", "approved", "rejected"];
const input = "rounded-lg border border-border bg-background px-3 py-2";

export default async function Inbox({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; focus?: string }> }) {
  const [sp, t, actor] = await Promise.all([searchParams, getTranslations("inbox"), requireActor()]);
  const status = (STATUSES as string[]).includes(sp.status ?? "") ? (sp.status as ReportStatus) : "pending";
  let list;
  try { list = await listInbox(db(), actor, { status }); } catch (e) { if (e instanceof ForbiddenError) redirect("/"); throw e; }
  const back = `/reports?status=${status}`;
  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <nav className="mt-3 flex flex-wrap gap-2" aria-label={t("filter")}>
        {STATUSES.map((s) => <Link key={s} href={`/reports?status=${s}`} aria-current={s === status ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm ${s === status ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{t(`status.${s}`)}</Link>)}
      </nav>
      <ReportErrorBanner code={sp.error} />
      {list.length === 0 && <p className="mt-4 text-muted">{t(`empty.${status}`)}</p>}
      <ul className="mt-4 flex flex-col gap-3">
        {list.map((r) => (
          <li key={r.id} id={r.id} className="rounded-xl border border-border p-3 text-sm">
            <p className="font-medium"><Link href={`/students/${r.studentId}`} className="underline">{r.studentName}</Link> · {r.volunteerDate}</p>
            <p>{r.reportType === "absence" ? t("absence") : `${r.placeName ?? ""} · ${r.windowLabel ?? ""}`}</p>
            <p>{t("reported", { n: r.reportedHours })}{r.startTime && r.endTime ? ` · ${r.startTime.slice(0, 5)}-${r.endTime.slice(0, 5)}` : ""}{r.status === "approved" ? ` · ${t("approved", { n: r.approvedHours })}` : ""}</p>
            {r.studentNotes && <p className="text-muted">{t("studentNote", { note: r.studentNotes })}</p>}
            {r.coordinatorNotes && r.status !== "pending" && <p className="text-muted">{t("coordinatorNote", { note: r.coordinatorNotes })}</p>}
            {status === "pending" && (
              <form action={decideAction} className="mt-2 flex flex-col gap-2">
                <input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="back" value={back} />
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1">{t("approvedHoursLabel")}<input name="approvedHours" type="number" step="0.25" min="0" max="24" defaultValue={r.approvedHours} className={`${input} w-28`} /></label>
                  {r.reportType === "absence" && <label className="flex items-center gap-1"><input type="checkbox" name="countsTowardTarget" value="1" defaultChecked />{t("countsTowardTarget")}</label>}
                  <button type="submit" name="kind" value="approve" className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{t("approve")}</button>
                </div>
                <label className="flex flex-col gap-1">{t("notesLabel")}<input name="notes" className={input} /></label>
                <div className="flex gap-2">
                  <button type="submit" name="kind" value="needs_correction" className="rounded-lg border border-border px-3 py-1.5">{t("needsCorrection")}</button>
                  <button type="submit" name="kind" value="reject" className="rounded-lg border border-red-300 px-3 py-1.5 text-red-700">{t("reject")}</button>
                </div>
              </form>
            )}
            {status === "approved" && actor.roles.includes("manager") && (
              <form action={decideAction} className="mt-2 flex flex-wrap items-end gap-2">
                <input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="kind" value="unapprove" />
                <label className="flex flex-col gap-1">{t("unapproveReason")}<input name="notes" required className={input} /></label>
                <button type="submit" className="rounded-lg border border-border px-3 py-1.5">{t("unapprove")}</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
