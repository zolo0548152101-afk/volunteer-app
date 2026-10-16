import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { addLineAction, cancelAction, finalizeAction, saveDraftAction } from "@/lib/actions/interviews";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { getDraft, listCandidateWindows, listCoordinatorsWithLoad } from "@/lib/services/interviews";
import { getStudentForStaff } from "@/lib/services/students";
import { loadLookup } from "@/lib/services/lookups";
import { NotFoundError } from "@/lib/services/users";
import { DAYS } from "@/lib/services/places";

const input = "rounded-lg border border-border bg-transparent px-2 py-1.5 text-base";

export default async function InterviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; city?: string; category?: string; day?: string; q?: string }> }) {
  const [{ id }, sp, actor, t, td, ti] = await Promise.all([params, searchParams, requireActor(), getTranslations("interviews"), getTranslations("days"), getTranslations("issues")]);
  let draft;
  try { draft = await getDraft(db(), actor, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const { interview: iv, lines, evaluation: ev } = draft;
  const student = await getStudentForStaff(db(), actor, iv.studentId);
  const editable = iv.status === "draft";
  const isInterview = iv.kind === "interview";
  const [cands, cats, coordinators] = await Promise.all([
    editable ? listCandidateWindows(db(), actor, iv.studentId, { city: sp.city, category: sp.category, day: sp.day, q: sp.q }) : Promise.resolve([]),
    loadLookup(db(), actor.organizationId, "volunteer_type"),
    editable && !student.coordinatorId ? listCoordinatorsWithLoad(db(), actor) : Promise.resolve([]),
  ]);
  const catLabel = new Map(cats.map((c) => [c.key, c.label]));
  const isManager = actor.roles.includes("manager");
  const warns = ev.issues.filter((i) => i.severity === "warn");
  const blocks = ev.issues.filter((i) => i.severity === "block");
  const label = (windowId: string) => lines.find((l) => l.timeWindowId === windowId)?.windowLabel ?? "";
  const errorKey = ["contract_blocked", "needs_override", "no_lines", "need_coordinator", "bad_coordinator", "override_reason_required", "override_forbidden", "not_draft", "bad_line", "forbidden", "not_found", "generic"].includes(sp.error ?? "") ? sp.error : null;

  return (
    <main className="mx-auto w-full max-w-4xl p-4">
      <Link href={`/students/${iv.studentId}`} className="text-sm underline">{t("backToStudent")}</Link>
      <h1 className="mt-2 text-xl font-semibold">{isInterview ? t("interviewWith", { name: `${student.firstName} ${student.lastName}` }) : t("reassignFor", { name: `${student.firstName} ${student.lastName}` })}</h1>
      {!editable && <p className="mt-2 rounded-lg border border-border p-3 text-sm">{t(`status.${iv.status}`)}</p>}
      {errorKey && <p role="alert" className="mt-3 rounded-lg border border-red-300 p-3 text-sm text-red-700">{t(`errors.${errorKey}`)}</p>}

      <section className="mt-4 rounded-xl border border-border p-3 text-sm" aria-labelledby="stu-h">
        <h2 id="stu-h" className="font-medium">{t("studentDetails")}</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[[t("city"), student.city], [t("institution"), student.institution], [t("degree"), student.fieldOfStudy],
            [t("preferredTypes"), student.preferredTypes.map((k) => catLabel.get(k) ?? k).join(", ")], [t("availableDays"), student.availableDays.map((d) => td(d)).join(", ")],
            [t("availableHours"), student.availableHours], [t("preferences"), student.generalPreferences], [t("notes"), student.studentNotes],
            [t("track"), student.trackName ? `${student.trackName} (${student.targetHours})` : null]].map(([k, v]) => (
            <div key={String(k)}><dt className="text-muted">{k}</dt><dd>{v || "—"}</dd></div>
          ))}
        </dl>
      </section>

      <section className="mt-6" aria-labelledby="bank-h">
        <h2 id="bank-h" className="text-lg font-medium">{t("banks")}</h2>
        {ev.bank ? (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-3 text-sm">
              <p className="font-medium">{t("studentBank")}</p>
              <p>{t("bankLine1", { approved: ev.bank.approved, target: ev.bank.target, remaining: ev.bank.remainingNeed })}</p>
              <p>{t("bankLine2", { weeks: ev.bank.weeksRemaining, needed: ev.bank.neededWeekly })}</p>
              <p>{t("bankLine3", { contract: ev.bank.contractWeekly, planned: ev.bank.plannedHours })}</p>
              <p className={`mt-1 font-medium ${ev.bank.status === "ok" ? "text-green-700" : "text-amber-700"}`}>{t(`bankStatus.${ev.bank.status}`, { gap: Math.abs(ev.bank.gap) })}</p>
            </div>
            <div className="rounded-xl border border-border p-3 text-sm">
              <p className="font-medium">{t("institutionBank")}</p>
              {Object.keys(ev.windows).length === 0 && <p className="text-muted">{t("noLines")}</p>}
              {Object.entries(ev.windows).map(([wid, u]) => (
                <p key={wid}>{label(wid)}: {t("windowLeft", { remainingSlots: u.remainingSlots, remainingHours: u.remainingHours })}</p>
              ))}
            </div>
          </div>
        ) : <p className="mt-2 text-sm text-muted">{t("noBank")}</p>}
        {(blocks.length > 0 || warns.length > 0) && (
          <div role="status">
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {blocks.map((i, n) => <li key={`b${n}`} className="text-red-700">⛔ {ti(i.code)}{i.timeWindowId ? ` (${label(i.timeWindowId)})` : ""}</li>)}
              {warns.map((i, n) => <li key={`w${n}`} className="text-amber-700">⚠ {ti(i.code)}</li>)}
            </ul>
          </div>
        )}
        <p className="mt-1 text-xs text-muted">{t("evalNote")}</p>
      </section>

      {editable && (
        <section className="mt-6" aria-labelledby="cand-h">
          <h2 id="cand-h" className="text-lg font-medium">{t("candidates")}</h2>
          <form className="mt-2 flex flex-wrap gap-2" method="get">
            <input name="q" defaultValue={sp.q} placeholder={t("search")} aria-label={t("search")} className={input} />
            <input name="city" defaultValue={sp.city} placeholder={t("city")} aria-label={t("city")} className={input} />
            <select name="category" defaultValue={sp.category ?? ""} aria-label={t("category")} className={input}><option value="">{t("allCategories")}</option>{cats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
            <select name="day" defaultValue={sp.day ?? ""} aria-label={t("day")} className={input}><option value="">{t("allDays")}</option>{DAYS.map((d) => <option key={d} value={d}>{td(d)}</option>)}</select>
            <button type="submit" className="rounded-lg border border-border px-3 py-1.5">{t("filter")}</button>
          </form>
          {cands.length === 0 && <p className="mt-3 text-muted">{t("noCandidates")}</p>}
          <ul className="mt-3 flex flex-col gap-2">
            {cands.map((c) => (
              <li key={c.windowId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
                <div>
                  <p className="font-medium">{c.placeName} · {c.label}</p>
                  <p className="text-muted">{[c.city, c.category ? catLabel.get(c.category) : null, c.days.map((d) => td(d)).join(", "), c.startTime && c.endTime ? `${c.startTime.slice(0, 5)}-${c.endTime.slice(0, 5)}` : null].filter(Boolean).join(" · ")}</p>
                  <p>{t("remaining", { slots: c.remainingSlots, hours: c.remainingHours })}
                    {c.overlapDays.length > 0 && <span className="ms-2 text-green-700">{t("overlap", { days: c.overlapDays.map((d) => td(d)).join(", ") })}</span>}
                    {c.typeMatch && <span className="ms-2 text-green-700">{t("typeMatch")}</span>}</p>
                </div>
                <form action={addLineAction}>
                  <input type="hidden" name="interviewId" value={id} /><input type="hidden" name="windowId" value={c.windowId} />
                  <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground">{t("addLine")}</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form action={saveDraftAction} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="interviewId" value={id} />
        <h2 className="text-lg font-medium">{t("lines")}</h2>
        {lines.length === 0 && <p className="text-muted">{t("noLines")}</p>}
        {lines.map((l, i) => (
          <fieldset key={l.id} disabled={!editable} className="rounded-xl border border-border p-3">
            <legend className="px-1 font-medium">{l.placeName} · {l.windowLabel}</legend>
            <input type="hidden" name={`l_${i}_window`} value={l.timeWindowId} />
            <div className="grid gap-2 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-sm">{t("slots")}<input name={`l_${i}_slots`} type="number" step="0.25" min="0.25" defaultValue={l.slots} className={input} /></label>
              <label className="flex flex-col gap-1 text-sm">{t("weekly")}<input name={`l_${i}_weekly`} type="number" step="0.25" min="0.25" defaultValue={l.weeklyHours} className={input} /></label>
              <label className="flex flex-col gap-1 text-sm">{t("assignedHours")}<input name={`l_${i}_hours`} defaultValue={l.assignedHours ?? ""} className={input} /></label>
              <label className="flex flex-col gap-1 text-sm">{t("reportHours")}<input name={`l_${i}_report`} type="number" step="any" min="0" defaultValue={l.defaultReportHours ?? ""} className={input} /></label>
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {DAYS.map((d) => <label key={d} className="flex items-center gap-1 text-sm"><input type="checkbox" name={`l_${i}_days`} value={d} defaultChecked={l.assignedDays.includes(d)} /> {td(d)}</label>)}
            </div>
            <label className="mt-2 flex flex-col gap-1 text-sm">{t("description")}<input name={`l_${i}_desc`} defaultValue={l.description ?? ""} className={input} /></label>
            {editable && <button type="submit" name="remove" value={String(i)} className="mt-2 text-sm underline">{t("removeLine")}</button>}
          </fieldset>
        ))}

        {isInterview && (
          <fieldset disabled={!editable} className="rounded-xl border border-border p-3">
            <legend className="px-1 font-medium">{t("interviewSummary")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">{t("date")}<input name="interviewDate" type="date" defaultValue={iv.interviewDate ?? ""} className={input} /></label>
              <label className="flex flex-col gap-1 text-sm">{t("impression")}
                <select name="generalImpression" defaultValue={iv.generalImpression ?? ""} className={input}><option value="">—</option>
                  {(["very_suitable", "suitable", "conditionally_suitable", "not_suitable"] as const).map((k) => <option key={k} value={k}>{t(`impressions.${k}`)}</option>)}</select></label>
              {(["preferencesDiscussed", "constraintsDiscussed", "placementDecisionNotes", "notes", "summary"] as const).map((k) => (
                <label key={k} className="flex flex-col gap-1 text-sm sm:col-span-2">{t(`f.${k}`)}<textarea name={k} defaultValue={iv[k] ?? ""} rows={2} className={input} /></label>
              ))}
            </div>
          </fieldset>
        )}

        {editable && (
          <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
            <button type="submit" className="self-start rounded-lg border border-border px-4 py-2">{t("saveDraft")}</button>
            {!student.coordinatorId && (
              <label className="flex flex-col gap-1 text-sm">{t("chooseCoordinator")}
                <select name="coordinatorId" required defaultValue="" className={input}><option value="">—</option>
                  {coordinators.map((c) => <option key={c.id} value={c.id}>{c.name} ({t("studentsCount", { n: c.students })})</option>)}</select></label>
            )}
            {ev.needsManagerOverride && !ev.blocked && (isManager
              ? <label className="flex flex-col gap-1 text-sm">{t("overrideReason")}<input name="overrideReason" className={input} /></label>
              : <p className="text-sm text-amber-700">{t("needsManager")}</p>)}
            <button type="submit" formAction={finalizeAction} className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground">{isInterview ? t("finalize") : t("finalizeReassign")}</button>
          </div>
        )}
      </form>
      {editable && (
        <form action={cancelAction} className="mt-3">
          <input type="hidden" name="interviewId" value={id} /><input type="hidden" name="studentId" value={iv.studentId} />
          <button type="submit" className="text-sm underline">{t("cancel")}</button>
        </form>
      )}
    </main>
  );
}
