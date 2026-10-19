import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cancelAction, finalizeAction, saveDraftAction } from "@/lib/actions/interviews";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { getDraft, listCandidateWindows, listCoordinatorsWithLoad } from "@/lib/services/interviews";
import { getStudentForStaff } from "@/lib/services/students";
import { loadLookup } from "@/lib/services/lookups";
import { NotFoundError } from "@/lib/services/users";
import { ForbiddenError } from "@/lib/permissions";
import { DAYS, type Day } from "@/lib/services/places";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";
import { PageHeader } from "@/components/page-header";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { PlacementEditor } from "@/components/interview/placement-editor";

const input = "min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base";

/**
 * מסך השיבוץ (ראיון או שיבוץ מחדש). המטרה: לקבוע לאילו מקומות הסטודנט משובץ ובכמה שעות,
 * ולראות מיד כמה שעות זה ייתן לו עד סוף השנה. העריכה עצמה ב-PlacementEditor; כאן הנתונים, הסיכום והאישור.
 */
export default async function InterviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, sp, actor, t, td, tc, ts] = await Promise.all([params, searchParams, requireActor(), getTranslations("interviews"), getTranslations("days"), getTranslations("common"), getTranslations("studentCard")]);
  let draft;
  try { draft = await getDraft(db(), actor, id); } catch (e) { if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound(); throw e; }
  const { interview: iv, lines, live } = draft;
  const student = await getStudentForStaff(db(), actor, iv.studentId);
  const editable = iv.status === "draft";
  const isInterview = iv.kind === "interview";
  const [cands, cats, coordinators] = await Promise.all([
    editable ? listCandidateWindows(db(), actor, iv.studentId) : Promise.resolve([]),
    loadLookup(db(), actor.organizationId, "volunteer_type"),
    editable && !student.coordinatorId ? listCoordinatorsWithLoad(db(), actor) : Promise.resolve([]),
  ]);
  const catLabels = Object.fromEntries(cats.map((c) => [c.key, c.label]));
  const dayLabels = Object.fromEntries(DAYS.map((d) => [d, td(d)])) as Record<Day, string>;
  const isManager = actor.roles.includes("manager");
  const name = `${student.firstName} ${student.lastName}`;
  const errorKey = ["contract_blocked", "needs_override", "no_lines", "need_coordinator", "bad_coordinator", "override_reason_required", "override_forbidden", "not_draft", "bad_line", "forbidden", "not_found", "generic"].includes(sp.error ?? "") ? sp.error : null;

  const initial = lines.map((l) => ({
    windowId: l.timeWindowId, slots: l.slots, weeklyHours: l.weeklyHours, days: l.assignedDays as Day[], hours: l.assignedHours ?? "",
    report: l.defaultReportHours === null ? "" : String(l.defaultReportHours), desc: l.description ?? "",
    meta: { windowId: l.timeWindowId, placeName: l.placeName, label: l.windowLabel, ...l.window },
  }));
  const candidates = cands.map((c) => ({
    windowId: c.windowId, placeName: c.placeName, label: c.label, city: c.city, category: c.category, days: c.days, startTime: c.startTime, endTime: c.endTime,
    hoursPerSlot: c.hoursPerSlot, slots: c.slots, taskDescription: c.taskDescription, remainingSlots: c.remainingSlots, remainingHours: c.remainingHours, overlapDays: c.overlapDays, typeMatch: c.typeMatch,
  }));

  // תקציר הסטודנט: מה שצריך כדי לבחור מקום (זמינות, תחומים, מסלול). השאר מתקפל
  const chip = (label: string, value: string | null | undefined) => value ? <span className="inline-flex items-baseline gap-1.5 rounded-full bg-paper px-3 py-1 text-sm"><span className="text-ink-3">{label}:</span><span className="font-medium">{value}</span></span> : null;

  const actions = editable ? (
    <>
      {!student.coordinatorId && (
        <label className="flex flex-col gap-1 text-sm text-ink-2">{t("chooseCoordinator")}
          <select name="coordinatorId" form="draft-form" defaultValue="" className={input}><option value="">—</option>
            {coordinators.map((c) => <option key={c.id} value={c.id}>{c.name} ({t("studentsCount", { n: c.students })})</option>)}</select></label>
      )}
      <SubmitButton form="draft-form" formAction={finalizeAction} className="min-h-12 rounded-lg bg-primary px-5 text-base font-semibold text-primary-foreground">{isInterview ? t("finalize") : t("finalizeReassign")}</SubmitButton>
      <SubmitButton form="draft-form" className="min-h-11 rounded-lg border border-border px-5 text-base hover:bg-paper">{t("saveDraft")}</SubmitButton>
      <p className="text-sm text-ink-3">{t("finalizeHint")}</p>
    </>
  ) : null;

  return (
    <main className="mx-auto w-full max-w-7xl p-4 lg:p-8">
      <PageHeader crumbs={[{ label: ts("listTitle"), href: "/students" }, { label: name, href: `/students/${iv.studentId}` }]} current={isInterview ? t("crumbInterview") : t("crumbReassign")} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{isInterview ? t("interviewWith", { name }) : t("reassignFor", { name })}</h1>
          <p className="mt-1 text-base text-ink-2">{t("purpose")}</p>
        </div>
      </div>
      {!editable && <p className="mt-3 rounded-lg border border-border p-3">{t(`status.${iv.status}`)}</p>}
      {errorKey && <Flash tone="error" className="mt-3 rounded-lg border border-bad/50 bg-bad-bg p-3 text-bad-fg">{t(`errors.${errorKey}`)}</Flash>}

      <section aria-label={t("studentDetails")} className="mt-4 rounded-2xl border border-hairline bg-card p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {chip(t("city"), student.city)}
          {chip(t("availableDays"), student.availableDays.map((d) => td(d)).join(", "))}
          {chip(t("availableHours"), student.availableHours)}
          {chip(t("preferredTypes"), student.preferredTypes.map((k) => catLabels[k] ?? k).join(", "))}
          {chip(t("track"), student.trackName ? `${student.trackName} · ${student.targetHours} ${tc("hours")}` : null)}
        </div>
        {(student.institution || student.fieldOfStudy || student.generalPreferences || student.studentNotes) && (
          <details className="mt-2">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-ink-2 underline">{t("moreDetails")}</summary>
            <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[[t("institution"), student.institution], [t("degree"), student.fieldOfStudy], [t("preferences"), student.generalPreferences], [t("notes"), student.studentNotes]].map(([k, v]) => (
                <div key={String(k)}><dt className="text-ink-3">{k}</dt><dd className="mt-0.5">{v || "—"}</dd></div>
              ))}
            </dl>
          </details>
        )}
      </section>

      <form id="draft-form" action={saveDraftAction} className="mt-6">
        <input type="hidden" name="interviewId" value={id} />
        <PlacementEditor key={lines.map((l) => l.id).join(",")} editable={editable} studentName={student.firstName} initial={initial} candidates={candidates} live={live}
          dayLabels={dayLabels} catLabels={catLabels} studentDays={student.availableDays as Day[]} actions={actions} canOverride={isManager}>
          {isInterview && (
            <fieldset disabled={!editable} className="rounded-2xl border border-hairline bg-card p-4 sm:p-5">
              <legend className="px-1 text-lg font-semibold">{t("interviewSummary")}</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-ink-2">{t("date")}<input name="interviewDate" type="date" defaultValue={iv.interviewDate ?? ""} className={input} /></label>
                <label className="flex flex-col gap-1 text-sm text-ink-2">{t("impression")}
                  <select name="generalImpression" defaultValue={iv.generalImpression ?? ""} className={input}><option value="">—</option>
                    {(["very_suitable", "suitable", "conditionally_suitable", "not_suitable"] as const).map((k) => <option key={k} value={k}>{t(`impressions.${k}`)}</option>)}</select></label>
                {(["preferencesDiscussed", "constraintsDiscussed", "placementDecisionNotes", "notes", "summary"] as const).map((k) => (
                  <label key={k} className="flex flex-col gap-1 text-sm text-ink-2 sm:col-span-2">{t(`f.${k}`)}<textarea name={k} defaultValue={iv[k] ?? ""} rows={2} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-base" /></label>
                ))}
              </div>
            </fieldset>
          )}
        </PlacementEditor>
      </form>
      {editable && (
        <form action={cancelAction} className="mt-6">
          <input type="hidden" name="interviewId" value={id} /><input type="hidden" name="studentId" value={iv.studentId} />
          <ConfirmSubmit label={t("cancel")} message={t("cancelConfirm")} confirmLabel={t("cancel")} className="min-h-11 text-sm text-bad-fg underline" />
        </form>
      )}
    </main>
  );
}
