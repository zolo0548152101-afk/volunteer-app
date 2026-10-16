import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { bulkApproveAction, decideAction } from "@/lib/actions/reports";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { inboxFilterOptions, listInbox, type ReportStatus } from "@/lib/services/reports";
import { ForbiddenError } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ReportErrorBanner } from "@/components/student/report-error";
import { SubmitButton } from "@/components/submit-button";

const STATUSES: ReportStatus[] = ["pending", "needs_correction", "approved", "rejected"];
const input = "rounded-lg border border-border bg-background px-3 py-2";

export default async function Inbox({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; focus?: string; student?: string; place?: string; month?: string; bulk?: string }> }) {
  const [sp, t, format, actor] = await Promise.all([searchParams, getTranslations("inbox"), getFormatter(), requireActor()]);
  const status = (STATUSES as string[]).includes(sp.status ?? "") ? (sp.status as ReportStatus) : "pending";
  const uuid = /^[0-9a-f-]{36}$/i;
  const studentId = uuid.test(sp.student ?? "") ? sp.student : undefined;
  const placeId = uuid.test(sp.place ?? "") ? sp.place : undefined;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month : undefined;
  let list, options;
  try {
    [list, options] = await Promise.all([listInbox(db(), actor, { status, studentId, placeId, month }), inboxFilterOptions(db(), actor, status)]);
  } catch (e) { if (e instanceof ForbiddenError) redirect("/"); throw e; }
  const qs = new URLSearchParams({ status, ...(studentId ? { student: studentId } : {}), ...(placeId ? { place: placeId } : {}), ...(month ? { month } : {}) }).toString();
  const back = `/reports?${qs}`;
  const filtered = !!(studentId || placeId || month);
  const [bOk, bFail] = (sp.bulk ?? "").split("-").map(Number);
  const bulkMsg = sp.bulk && Number.isFinite(bOk) ? (bFail ? t("bulkPartial", { n: bOk, failed: bFail }) : bOk ? t("bulkDone", { n: bOk }) : t("bulkNone")) : null;
  const date = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <nav className="mt-3 flex flex-wrap gap-2" aria-label={t("filter")}>
        {STATUSES.map((s) => <Link key={s} href={`/reports?status=${s}`} aria-current={s === status ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm ${s === status ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{t(`status.${s}`)}</Link>)}
      </nav>
      <form method="get" action="/reports" className="mt-3 flex flex-wrap items-end gap-2 text-sm" aria-label={t("filters")}>
        <input type="hidden" name="status" value={status} />
        <label className="flex flex-col gap-1">{t("filterStudent")}
          <select name="student" aria-label={t("filterStudent")} defaultValue={studentId ?? ""} className={`${input} min-h-11`}>
            <option value="">{t("filterAll")}</option>
            {options.students.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">{t("filterPlace")}
          <select name="place" aria-label={t("filterPlace")} defaultValue={placeId ?? ""} className={`${input} min-h-11`}>
            <option value="">{t("filterAll")}</option>
            {options.places.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">{t("filterMonth")}
          <input name="month" aria-label={t("filterMonth")} type="month" defaultValue={month ?? ""} className={`${input} min-h-11`} />
        </label>
        <SubmitButton className="min-h-11 rounded-lg border border-border px-4">{t("applyFilters")}</SubmitButton>
        {filtered && <Link href={`/reports?status=${status}`} className="inline-flex min-h-11 items-center underline">{t("clearFilters")}</Link>}
      </form>
      <ReportErrorBanner code={sp.error} />
      {bulkMsg && <p role="status" className="mt-3 rounded-lg border border-border p-3 text-sm">{bulkMsg}</p>}
      {status === "pending" && list.length > 0 && (
        <form id="bulk" action={bulkApproveAction} className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <input type="hidden" name="back" value={back} />
          <SubmitButton className="min-h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground">{t("bulkApprove")}</SubmitButton>
          <span className="text-muted">{t("bulkHint")}</span>
        </form>
      )}
      {list.length === 0 && <p className="mt-4 text-muted">{t(`empty.${status}`)}</p>}
      <ul className="mt-4 flex flex-col gap-3">
        {list.map((r) => (
          <li key={r.id} id={r.id} className="rounded-xl border border-border p-3 text-sm">
            <p className="flex flex-wrap items-center gap-x-2 font-medium">
              {status === "pending" && <input type="checkbox" name="ids" value={r.id} form="bulk" aria-label={t("pick", { student: r.studentName })} className="size-5" />}
              <Link href={`/students/${r.studentId}`} className="underline">{r.studentName}</Link> · {date(r.volunteerDate)}</p>
            <p>{r.reportType === "absence" ? t("absence") : `${r.placeName ?? ""} · ${r.windowLabel ?? ""}`}</p>
            <p>{t("reported", { n: r.reportedHours })}{r.startTime && r.endTime ? <> · <span dir="ltr">{r.startTime.slice(0, 5)}–{r.endTime.slice(0, 5)}</span></> : ""}{r.status === "approved" ? ` · ${t("approved", { n: r.approvedHours })}` : ""}</p>
            {r.studentNotes && <p className="text-muted">{t("studentNote", { note: r.studentNotes })}</p>}
            {r.coordinatorNotes && r.status !== "pending" && <p className="text-muted">{t("coordinatorNote", { note: r.coordinatorNotes })}</p>}
            {status === "pending" && (
              <form action={decideAction} className="mt-2 flex flex-col gap-2">
                <input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="back" value={back} />
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1">{t("approvedHoursLabel")}<input name="approvedHours" type="number" step="0.25" min="0" max={r.reportedHours} defaultValue={r.approvedHours} className={`${input} w-28`} /></label>
                  {r.reportType === "absence" && <label className="flex items-center gap-1"><input type="checkbox" name="countsTowardTarget" value="1" defaultChecked />{t("countsTowardTarget")}</label>}
                  <SubmitButton name="kind" value="approve" className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{t("approve")}</SubmitButton>
                </div>
                <label className="flex flex-col gap-1">{t("notesLabel")}<input name="notes" className={input} /></label>
                <div className="flex gap-2">
                  <SubmitButton name="kind" value="needs_correction" className="rounded-lg border border-border px-3 py-1.5">{t("needsCorrection")}</SubmitButton>
                  <SubmitButton name="kind" value="reject" className="rounded-lg border border-red-300 px-3 py-1.5 text-red-700">{t("reject")}</SubmitButton>
                </div>
              </form>
            )}
            {status === "approved" && actor.roles.includes("manager") && (
              <form action={decideAction} className="mt-2 flex flex-wrap items-end gap-2">
                <input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="kind" value="unapprove" />
                <label className="flex flex-col gap-1">{t("unapproveReason")}<input name="notes" required className={input} /></label>
                <SubmitButton className="rounded-lg border border-border px-3 py-1.5">{t("unapprove")}</SubmitButton>
              </form>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
