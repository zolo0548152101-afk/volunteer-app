import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { bulkApproveAction, decideAction, editReportAction } from "@/lib/actions/reports";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { CustomFields } from "@/components/custom-fields/custom-fields";
import { listFields, loadValuesMany } from "@/lib/services/custom-fields";
import { inboxFilterOptions, listInbox, type ReportStatus } from "@/lib/services/reports";
import { ForbiddenError } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ReportErrorBanner } from "@/components/student/report-error";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";
import { ListView } from "@/components/list-view";
import { EditDialog } from "@/components/edit-dialog";
import { FilterBar } from "@/components/filter-bar";
import { dt, Th } from "@/components/data-table";

const STATUSES: ReportStatus[] = ["pending", "needs_correction", "approved", "rejected"];
const input = "rounded-lg border border-border bg-background px-3 py-2";

export default async function Inbox({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; focus?: string; student?: string; place?: string; month?: string; bulk?: string; coordinator?: string; saved?: string }> }) {
  const [sp, t, format, actor] = await Promise.all([searchParams, getTranslations("inbox"), getFormatter(), requireActor()]);
  const status = (STATUSES as string[]).includes(sp.status ?? "") ? (sp.status as ReportStatus) : "pending";
  const uuid = /^[0-9a-f-]{36}$/i;
  const studentId = uuid.test(sp.student ?? "") ? sp.student : undefined;
  const placeId = uuid.test(sp.place ?? "") ? sp.place : undefined;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month : undefined;
  const coordinatorId = uuid.test(sp.coordinator ?? "") && actor.roles.includes("manager") ? sp.coordinator : undefined;
  const isManager = actor.roles.includes("manager");
  let list, options;
  try {
    [list, options] = await Promise.all([listInbox(db(), actor, { status, studentId, placeId, month, coordinatorId }), inboxFilterOptions(db(), actor, status)]);
  } catch (e) { if (e instanceof ForbiddenError) redirect("/"); throw e; }
  const reportFields = (await listFields(db(), actor, "report", "report_form")).map((f) => ({ ...f, canEdit: false }));
  const reportValues = reportFields.length ? await loadValuesMany(db(), actor.organizationId, list.map((r) => r.id), reportFields) : new Map();
  const qs = new URLSearchParams({ status, ...(studentId ? { student: studentId } : {}), ...(placeId ? { place: placeId } : {}), ...(month ? { month } : {}), ...(coordinatorId ? { coordinator: coordinatorId } : {}) }).toString();
  const back = `/reports?${qs}`;
  const search = (r: (typeof list)[number]) => [r.studentName, r.volunteerDate, date(r.volunteerDate), r.reportType === "absence" ? t("absence") : `${r.placeName ?? ""} ${r.windowLabel ?? ""}`, r.coordinatorName, t(`status.${r.status}`), r.reportedHours, r.studentNotes, r.coordinatorNotes].filter(Boolean).join(" ");
  const monthOptions = (() => {
    const now = new Date(); const out: { value: string; label: string }[] = [];
    for (let i = 0; i < 18; i++) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); out.push({ value: d.toISOString().slice(0, 7), label: format.dateTime(d, { month: "long", year: "numeric", timeZone: "UTC" }) }); }
    if (month && !out.some((o) => o.value === month)) out.push({ value: month, label: month });
    return out;
  })();
  const filterFields = [
    { name: "student", label: t("filterStudent"), value: studentId, options: options.students.map((o) => ({ value: o.id, label: o.name })) },
    { name: "place", label: t("filterPlace"), value: placeId, options: options.places.map((o) => ({ value: o.id, label: o.name })) },
    ...(isManager && options.coordinators.length > 0 ? [{ name: "coordinator", label: t("filterCoordinator"), value: coordinatorId, options: options.coordinators.map((o) => ({ value: o.id, label: o.name })) }] : []),
    { name: "month", label: t("filterMonth"), value: month, options: monthOptions },
  ];
  const [bOk, bFail] = (sp.bulk ?? "").split("-").map(Number);
  const bulkMsg = sp.bulk && Number.isFinite(bOk) ? (bFail ? t("bulkPartial", { n: bOk, failed: bFail }) : bOk ? t("bulkDone", { n: bOk }) : t("bulkNone")) : null;
  const groups: { key: string; name: string; rows: typeof list }[] = [];
  for (const r of list) {
    const key = isManager ? (r.coordinatorId ?? "") : "all"; // לפי מזהה, לא לפי שם: שני רכזים עם אותו שם לא מתמזגים
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, name: r.coordinatorName ?? t("noCoordinator"), rows: [] }; groups.push(g); }
    g.rows.push(r);
  }
  const date = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const actions = (r: (typeof list)[number]) => (
    <div className="flex flex-col gap-2">
              {status === "pending" && (
                <form action={decideAction} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="back" value={back} />
                  <div className="contents">
                    <label className="flex flex-col gap-1">{t("approvedHoursLabel")}<input name="approvedHours" type="number" step="0.25" min="0" max={r.reportedHours} defaultValue={r.approvedHours} className={`${input} w-28`} /></label>
                    {r.reportType === "absence" && <label className="flex items-center gap-1"><input type="checkbox" name="countsTowardTarget" value="1" defaultChecked />{t("countsTowardTarget")}</label>}
                    <SubmitButton name="kind" value="approve" className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{t("approve")}</SubmitButton>
                  </div>
                  <label className="flex min-w-48 flex-1 flex-col gap-1">{t("notesLabel")}<input name="notes" className={input} /></label>
                  <div className="flex gap-2">
                    <SubmitButton name="kind" value="needs_correction" className="rounded-lg border border-border px-3 py-1.5">{t("needsCorrection")}</SubmitButton>
                    <SubmitButton name="kind" value="reject" className="rounded-lg border border-bad/50 px-3 py-1.5 text-bad-fg">{t("reject")}</SubmitButton>
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
              <h3 className="mt-4 text-sm font-semibold">{t("edit")}</h3>
                <form action={editReportAction} className="mt-2 grid grid-cols-2 gap-2">
                  <input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="back" value={back} />
                  <label className="flex flex-col gap-1">{t("editDate")}<input name="volunteerDate" type="date" required defaultValue={r.volunteerDate} className={`${input} min-h-11`} /></label>
                  <label className="flex flex-col gap-1">{t("editReported")}<input name="reportedHours" type="number" step="0.25" min="0" required defaultValue={r.reportedHours} className={`${input} min-h-11`} /></label>
                  <label className="flex flex-col gap-1">{t("editStart")}<input name="startTime" type="time" defaultValue={r.startTime?.slice(0, 5) ?? ""} className={`${input} min-h-11`} /></label>
                  <label className="flex flex-col gap-1">{t("editEnd")}<input name="endTime" type="time" defaultValue={r.endTime?.slice(0, 5) ?? ""} className={`${input} min-h-11`} /></label>
                  <label className="flex flex-col gap-1">{t("editApproved")}<input name="approvedHours" type="number" step="0.25" min="0" required defaultValue={r.approvedHours ?? r.reportedHours} className={`${input} min-h-11`} /></label>
                  <label className="col-span-2 flex flex-col gap-1">{t("notesLabelEdit")}<input name="notes" defaultValue={r.coordinatorNotes ?? ""} className={`${input} min-h-11`} /></label>
                  <SubmitButton className="col-span-2 min-h-11 rounded-lg border border-border px-4">{t("editSave")}</SubmitButton>
                </form>
                <p className="mt-1 text-muted">{t("editHint")}</p>
              
    </div>
  );
  return (
    <main className="mx-auto w-full max-w-7xl p-4 lg:p-8">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <nav className="mt-3 flex flex-wrap gap-2" aria-label={t("filter")}>
        {STATUSES.map((s) => <Link key={s} href={`/reports?status=${s}`} aria-current={s === status ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm ${s === status ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{t(`status.${s}`)}</Link>)}
      </nav>
      <ReportErrorBanner code={sp.error} />
      {sp.saved && <Flash tone="status" className="mt-3 rounded-lg border border-border p-3 text-sm">{t("saved")}</Flash>}
      {bulkMsg && <Flash tone="status" className="mt-3 rounded-lg border border-border p-3 text-sm">{bulkMsg}</Flash>}
      {status === "pending" && list.length > 0 && (
        <form id="bulk" action={bulkApproveAction} className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <input type="hidden" name="back" value={back} />
          <SubmitButton className="min-h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground">{t("bulkApprove")}</SubmitButton>
          <span className="text-muted">{t("bulkHint")}</span>
        </form>
      )}
      {list.length === 0 && <p className="mt-4 text-muted">{t(`empty.${status}`)}</p>}
      <ListView storageKey="inbox" placeholder={t("searchPlaceholder")}
        toolbar={<FilterBar action="/reports" keep={{ status }} fields={filterFields} labels={{ filter: t("filters"), title: t("filtersTitle"), all: t("filterAll"), apply: t("applyFilters"), clear: t("clearFilters"), remove: t("removeFilter") }} />}
        cards={(
        <>
        {groups.map((g) => (
          <section key={g.key} data-group className="mt-4" aria-label={isManager ? g.name : undefined}>
            {isManager && <h2 className="text-base font-semibold">{g.name} <span className="text-sm font-normal text-muted">({t("groupCount", { n: g.rows.length })})</span></h2>}
            <ul className="mt-2 flex flex-col gap-3">
          {g.rows.map((r) => (
            <li key={r.id} id={r.id} tabIndex={-1} data-search={search(r)} className="rounded-xl border border-border p-3 text-sm outline-none">
              <p className="flex flex-wrap items-center gap-x-2 font-medium">
                {status === "pending" && r.reportType !== "absence" && <input type="checkbox" name="ids" value={r.id} form="bulk" aria-label={t("pick", { student: r.studentName })} className="size-5" />}
                <Link href={`/students/${r.studentId}`} className="underline">{r.studentName}</Link> · {date(r.volunteerDate)}</p>
              <p>{r.reportType === "absence" ? t("absence") : `${r.placeName ?? ""} · ${r.windowLabel ?? ""}`}</p>
              <p>{t("reported", { n: r.reportedHours })}{r.startTime && r.endTime ? <> · <span dir="ltr">{r.startTime.slice(0, 5)}–{r.endTime.slice(0, 5)}</span></> : ""}{r.status === "approved" ? ` · ${t("approved", { n: r.approvedHours })}` : ""}</p>
              {r.studentNotes && <p className="text-muted">{t("studentNote", { note: r.studentNotes })}</p>}
              {r.coordinatorNotes && r.status !== "pending" && <p className="text-muted">{t("coordinatorNote", { note: r.coordinatorNotes })}</p>}
              {reportFields.length > 0 && <div className="mt-1"><CustomFields fields={reportFields} values={reportValues.get(r.id) ?? {}} /></div>}
              {r.attachment && <p><a href={`/api/reports/${r.id}/attachment`} target="_blank" rel="noopener" className="underline">{t("attachment")}</a></p>}
              {status === "pending" && (
                <form action={decideAction} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="back" value={back} />
                  <div className="contents">
                    <label className="flex flex-col gap-1">{t("approvedHoursLabel")}<input name="approvedHours" type="number" step="0.25" min="0" max={r.reportedHours} defaultValue={r.approvedHours} className={`${input} w-28`} /></label>
                    {r.reportType === "absence" && <label className="flex items-center gap-1"><input type="checkbox" name="countsTowardTarget" value="1" defaultChecked />{t("countsTowardTarget")}</label>}
                    <SubmitButton name="kind" value="approve" className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{t("approve")}</SubmitButton>
                  </div>
                  <label className="flex min-w-48 flex-1 flex-col gap-1">{t("notesLabel")}<input name="notes" className={input} /></label>
                  <div className="flex gap-2">
                    <SubmitButton name="kind" value="needs_correction" className="rounded-lg border border-border px-3 py-1.5">{t("needsCorrection")}</SubmitButton>
                    <SubmitButton name="kind" value="reject" className="rounded-lg border border-bad/50 px-3 py-1.5 text-bad-fg">{t("reject")}</SubmitButton>
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
              <details className="mt-2">
                <summary className="inline-flex min-h-11 cursor-pointer items-center underline">{t("edit")}</summary>
                <form action={editReportAction} className="mt-2 grid grid-cols-2 gap-2">
                  <input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="back" value={back} />
                  <label className="flex flex-col gap-1">{t("editDate")}<input name="volunteerDate" type="date" required defaultValue={r.volunteerDate} className={`${input} min-h-11`} /></label>
                  <label className="flex flex-col gap-1">{t("editReported")}<input name="reportedHours" type="number" step="0.25" min="0" required defaultValue={r.reportedHours} className={`${input} min-h-11`} /></label>
                  <label className="flex flex-col gap-1">{t("editStart")}<input name="startTime" type="time" defaultValue={r.startTime?.slice(0, 5) ?? ""} className={`${input} min-h-11`} /></label>
                  <label className="flex flex-col gap-1">{t("editEnd")}<input name="endTime" type="time" defaultValue={r.endTime?.slice(0, 5) ?? ""} className={`${input} min-h-11`} /></label>
                  <label className="flex flex-col gap-1">{t("editApproved")}<input name="approvedHours" type="number" step="0.25" min="0" required defaultValue={r.approvedHours ?? r.reportedHours} className={`${input} min-h-11`} /></label>
                  <label className="col-span-2 flex flex-col gap-1">{t("notesLabelEdit")}<input name="notes" defaultValue={r.coordinatorNotes ?? ""} className={`${input} min-h-11`} /></label>
                  <SubmitButton className="col-span-2 min-h-11 rounded-lg border border-border px-4">{t("editSave")}</SubmitButton>
                </form>
                <p className="mt-1 text-muted">{t("editHint")}</p>
              </details>
            </li>
          ))}
            </ul>
          </section>
        ))}
        </>
      )} table={(
        <table className={dt.table}>
          <thead className={dt.head}>
            <tr>
              {status === "pending" && <th scope="col" className="w-0 px-3 py-2"><span className="sr-only">{t("pickColumn")}</span></th>}
              <Th sort="text">{t("col.student")}</Th>
              <Th sort="text">{t("col.date")}</Th>
              <Th sort="text">{t("col.place")}</Th>
              {isManager && <Th sort="text">{t("col.coordinator")}</Th>}
              <Th sort="num" num>{t("col.reported")}</Th>
              <Th sort="num" num>{t("col.approved")}</Th>
              <Th sort="text">{t("col.status")}</Th>
              <Th>{t("col.actions")}</Th>
            </tr>
          </thead>
          <tbody className={dt.body}>
            {list.map((r) => (
              <tr key={r.id} data-search={search(r)}>
                {status === "pending" && <td className={dt.td}>{r.reportType !== "absence" && <input type="checkbox" name="ids" value={r.id} form="bulk" aria-label={t("pick", { student: r.studentName })} className="size-5" />}</td>}
                <td className={`${dt.td} font-medium`}><Link href={`/students/${r.studentId}`} className="underline">{r.studentName}</Link></td>
                <td className={`${dt.td} whitespace-nowrap`} data-v={r.volunteerDate}>{date(r.volunteerDate)}</td>
                <td className={dt.td}>{r.reportType === "absence" ? t("absence") : `${r.placeName ?? ""} · ${r.windowLabel ?? ""}`}</td>
                {isManager && <td className={dt.td}>{r.coordinatorName ?? t("noCoordinator")}</td>}
                <td className={dt.num}>{r.reportedHours}</td>
                <td className={dt.num}>{r.status === "approved" ? r.approvedHours : "—"}</td>
                <td className={dt.td}>{t(`status.${r.status}`)}</td>
                <td className={dt.actions}>
                  <span className="flex items-center gap-3">
                    {status === "pending" && r.reportType !== "absence" && (
                      <form action={decideAction}>
                        <input type="hidden" name="reportId" value={r.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="kind" value="approve" /><input type="hidden" name="approvedHours" value={r.approvedHours ?? r.reportedHours} />
                        <SubmitButton aria-label={t("approveQuick", { student: r.studentName })} className="min-h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">{t("approve")}</SubmitButton>
                      </form>
                    )}
                    <EditDialog label={t("editShort")} title={`${r.studentName} · ${date(r.volunteerDate)}`}>
                      <p className="mb-3 text-ink-2">{r.reportType === "absence" ? t("absence") : `${r.placeName ?? ""} · ${r.windowLabel ?? ""}`} · {t("reported", { n: r.reportedHours })}</p>
                      {actions(r)}
                    </EditDialog>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )} />
    </main>
  );
}
