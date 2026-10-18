import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { formatDay } from "@/lib/date-format";
import { startInterviewAction } from "@/lib/actions/interviews";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { studentHistory } from "@/lib/services/interviews";
import { getStudentForStaff } from "@/lib/services/students";
import { listFields, loadValues } from "@/lib/services/custom-fields";
import { loadLookup } from "@/lib/services/lookups";
import { NotFoundError } from "@/lib/services/users";
import { ForbiddenError } from "@/lib/permissions";
import { saveStudentByStaffAction } from "@/lib/actions/student";
import { AcademicSection, BankSection, PrefsSection } from "@/components/student/sections";
import { CustomFields } from "@/components/custom-fields/custom-fields";
import { SubmitButton } from "@/components/submit-button";
import { InlineEdit } from "@/components/inline-edit";
import { Flash } from "@/components/flash";

export default async function StudentCard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; done?: string; invite?: string }> }) {
  const [{ id }, sp, actor, t, ti, td, tdt, tdy, tp, format] = await Promise.all([params, searchParams, requireActor(), getTranslations("studentCard"), getTranslations("interviews"), getTranslations("days"), getTranslations("degreeTypes"), getTranslations("degreeYears"), getTranslations("profile"), getFormatter()]);
  let s, history;
  try {
    s = await getStudentForStaff(db(), actor, id);
    history = await studentHistory(db(), actor, id);
  } catch (e) { if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound(); throw e; }
  const [fields, cats] = await Promise.all([listFields(db(), actor, "student"), loadLookup(db(), actor.organizationId, "volunteer_type")]);
  const values = await loadValues(db(), actor.organizationId, id, fields);
  const canInterview = can(actor, "create", "interview", { organizationId: actor.organizationId });
  const canReassign = can(actor, "reassign", "placement", { organizationId: actor.organizationId, ownerId: id, coordinatorIds: s.coordinatorId ? [s.coordinatorId] : [] });
  const active = history.placements.filter((p) => p.isActive);
  const catLabel = new Map(cats.map((c) => [c.key, c.label]));
  const canEdit = can(actor, "update", "student_profile", { organizationId: actor.organizationId, ownerId: id, coordinatorIds: s.coordinatorId ? [s.coordinatorId] : [] });
  const canEditId = s.nationalId !== undefined && can(actor, "update", "bank_details", { organizationId: actor.organizationId, ownerId: id });
  const institutions = canEdit ? (await loadLookup(db(), actor.organizationId, "institution")).map((i) => i.label) : [];
  const profileForEdit = { ...s, nationalId: s.nationalId ?? null, bankName: s.bankName ?? null, bankBranch: s.bankBranch ?? null, bankAccount: s.bankAccount ?? null, accountOwner: s.accountOwner ?? null, bankDocument: s.bankDocument ?? null } as unknown as Parameters<typeof AcademicSection>[0]["p"];
  const draft = history.interviews.find((i) => i.status === "draft");
  const errorKey = ["forbidden", "not_found", "bad_date", "bad_id", "cf_required", "already_has_draft", "not_student", "generic"].includes(sp.error ?? "") ? sp.error : null;
  const row = (k: string, v: React.ReactNode) => <div key={k} className="min-w-0"><dt className="text-xs text-ink-3">{k}</dt><dd className="mt-0.5 break-words">{v || "—"}</dd></div>;
  const dl = (children: React.ReactNode) => <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">{children}</dl>;
  const card = "rounded-xl border border-hairline bg-card p-4";
  const editForm = (section: "academic" | "prefs" | "bank", fieldsNode: React.ReactNode) => (
    <form action={saveStudentByStaffAction} className="flex flex-col gap-3">
      <input type="hidden" name="studentId" value={id} /><input type="hidden" name="section" value={section} />
      {fieldsNode}
      <div><SubmitButton className="min-h-10 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground">{t("saveDetails")}</SubmitButton></div>
    </form>
  );
  const showBank = s.bankAccount !== undefined || canEditId;
  const customView = fields.length > 0 ? <div className="mt-3 border-t border-hairline pt-3"><CustomFields fields={fields.map((f) => ({ ...f, canEdit: false }))} values={values} /></div> : null;

  return (
    <main className="mx-auto w-full max-w-6xl p-4">
      <header className={`${card} flex flex-wrap items-start justify-between gap-4`}>
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="grid size-12 flex-none place-items-center rounded-full bg-info text-lg font-bold text-white">{s.firstName.charAt(0)}</span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{s.firstName} {s.lastName}</h1>
            <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2"><span dir="ltr">{s.email}</span><span dir="ltr">{s.phone}</span></p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/certificate/${id}`} className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm hover:bg-paper">{ti("certificateLink")}</Link>
          {draft && <Link href={`/interviews/${draft.id}`} className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm text-primary-foreground">{t("continueDraft")}</Link>}
          {!draft && canInterview && (
            <form action={startInterviewAction}><input type="hidden" name="studentId" value={id} /><input type="hidden" name="kind" value="interview" />
              <SubmitButton className="min-h-10 rounded-lg bg-primary px-4 text-sm text-primary-foreground">{t("startInterview")}</SubmitButton></form>
          )}
          {!draft && canReassign && (
            <form action={startInterviewAction}><input type="hidden" name="studentId" value={id} /><input type="hidden" name="kind" value="reassignment" />
              <SubmitButton className="min-h-10 rounded-lg border border-border px-4 text-sm hover:bg-paper">{t("reassign")}</SubmitButton></form>
          )}
        </div>
      </header>
      {sp.done && <Flash tone="status" className="mt-3 rounded-lg border border-ok/50 p-3 text-sm text-ok-fg">{sp.done === "saved" ? t("saved") : t("done")}</Flash>}
      {sp.invite === "failed" && <Flash tone="error" className="mt-3 rounded-lg border border-warn/50 bg-warn-bg p-3 text-sm text-warn-fg">{t("inviteFailed")}</Flash>}
      {errorKey && <Flash tone="error" className="mt-3 rounded-lg border border-bad/50 p-3 text-sm text-bad-fg">{ti(`errors.${errorKey}`)}</Flash>}

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <InlineEdit id="academic" title={t("section.academic")} canEdit={canEdit}
            view={dl(<>
              {s.nationalId !== undefined && row(tp("nationalId"), <span dir="ltr">{s.nationalId}</span>)}
              {row(tp("dateOfBirth"), s.dateOfBirth ? formatDay(format, s.dateOfBirth) : null)}
              {row(tp("city"), s.city)}
              {row(tp("institution"), s.institution)}
              {row(tp("degreeType"), s.degreeType ? tdt(s.degreeType) : null)}
              {row(tp("degreeYear"), s.degreeYear ? tdy(s.degreeYear) : null)}
              {row(tp("fieldOfStudy"), s.fieldOfStudy)}
            </>)}
            form={editForm("academic", <AcademicSection p={profileForEdit} institutions={institutions} hideId={!canEditId} />)} />

          <InlineEdit id="prefs" title={t("section.prefs")} canEdit={canEdit}
            view={<>{dl(<>
              {row(tp("preferredTypes"), s.preferredTypes.map((k) => catLabel.get(k) ?? k).join(", "))}
              {row(tp("preferredActivities"), s.preferredActivities)}
              {row(tp("availableDays"), s.availableDays.map((d) => td(d)).join(", "))}
              {row(tp("availableHours"), s.availableHours)}
              {row(tp("generalPreferences"), s.generalPreferences)}
              {row(tp("studentNotes"), s.studentNotes)}
            </>)}{customView}</>}
            form={editForm("prefs", <><PrefsSection p={profileForEdit} types={cats} />{fields.some((f) => f.canEdit) && <CustomFields fields={fields} values={values} />}</>)} />

          {showBank && (
            <InlineEdit id="bank" title={t("section.bank")} canEdit={canEditId}
              view={dl(<>
                {row(tp("bankName"), s.bankName)}
                {row(tp("bankBranch"), s.bankBranch && <span dir="ltr">{s.bankBranch}</span>)}
                {row(tp("bankAccount"), s.bankAccount && <span dir="ltr">{s.bankAccount}</span>)}
                {row(tp("accountOwner"), s.accountOwner)}
              </>)}
              form={editForm("bank", <BankSection p={profileForEdit} />)} />
          )}
        </div>

        <div className="flex flex-col gap-3">
          <section className={card} aria-labelledby="program-h">
            <h2 id="program-h" className="text-sm font-semibold">{t("section.program")}</h2>
            <div className="mt-3">{dl(<>
              {row(t("track"), s.trackName ? `${s.trackName} (${s.targetHours})` : null)}
              {row(t("coordinator"), s.coordinatorName ?? t("unassigned"))}
            </>)}</div>
          </section>

          <section className={card} aria-labelledby="placements-h">
            <h2 id="placements-h" className="text-sm font-semibold">{t("currentPlacements")}</h2>
            {active.length === 0 && <p className="mt-2 text-sm text-ink-3">{t("noPlacements")}</p>}
            <ul className="mt-2 flex flex-col divide-y divide-hairline text-sm">
              {active.map((p) => (
                <li key={p.id} className="py-2 first:pt-0 last:pb-0">
                  <p className="font-medium">{p.placeName} · {p.windowLabel}</p>
                  <p className="text-ink-2">{t("placementLine", { slots: p.slots, weekly: p.weeklyHours, days: p.assignedDays.map((d) => td(d)).join(", ") })}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className={card} aria-labelledby="history-h">
            <h2 id="history-h" className="text-sm font-semibold">{t("history")}</h2>
            <ul className="mt-2 flex flex-col divide-y divide-hairline text-sm">
              {history.interviews.map((i) => (
                <li key={i.id} className="py-2 first:pt-0 last:pb-0">
                  <p className="font-medium">{t(`kind.${i.kind}`)} · {i.interviewDate ?? ""} · {ti(`status.${i.status}`)}</p>
                  {i.summary && <p className="text-ink-2">{i.summary}</p>}
                  {i.status === "draft" && <Link href={`/interviews/${i.id}`} className="underline">{t("continueDraft")}</Link>}
                </li>
              ))}
              {history.placements.filter((p) => !p.isActive).map((p) => (
                <li key={p.id} className="py-2 text-ink-2 first:pt-0 last:pb-0">
                  {p.placeName} · {p.windowLabel} · {p.startedAt ? formatDay(format, p.startedAt) : ""} – {p.endedAt ? formatDay(format, p.endedAt) : ""}
                </li>
              ))}
              {history.interviews.length === 0 && history.placements.filter((p) => !p.isActive).length === 0 && <li className="text-ink-3">{t("noHistory")}</li>}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
