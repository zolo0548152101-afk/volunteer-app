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
import { CustomFields } from "@/components/custom-fields/custom-fields";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";

export default async function StudentCard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; done?: string }> }) {
  const [{ id }, sp, actor, t, ti, td, tdt, format] = await Promise.all([params, searchParams, requireActor(), getTranslations("studentCard"), getTranslations("interviews"), getTranslations("days"), getTranslations("degreeTypes"), getFormatter()]);
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
  const draft = history.interviews.find((i) => i.status === "draft");
  const errorKey = ["forbidden", "not_found", "already_has_draft", "not_student", "generic"].includes(sp.error ?? "") ? sp.error : null;
  const row = (k: string, v: React.ReactNode) => <div key={k}><dt className="text-muted">{k}</dt><dd>{v || "—"}</dd></div>;

  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <h1 className="text-xl font-semibold">{s.firstName} {s.lastName}</h1>
      {sp.done && <Flash tone="status" className="mt-2 rounded-lg border border-ok/50 p-3 text-sm text-ok-fg">{t("done")}</Flash>}
      {errorKey && <Flash tone="error" className="mt-2 rounded-lg border border-bad/50 p-3 text-sm text-bad-fg">{ti(`errors.${errorKey}`)}</Flash>}
      <div className="mt-3 flex flex-wrap gap-3">
        <Link href={`/certificate/${id}`} className="rounded-lg border border-border px-4 py-2">{ti("certificateLink")}</Link>
        {draft && <Link href={`/interviews/${draft.id}`} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{t("continueDraft")}</Link>}
        {!draft && canInterview && (
          <form action={startInterviewAction}><input type="hidden" name="studentId" value={id} /><input type="hidden" name="kind" value="interview" />
            <SubmitButton className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{t("startInterview")}</SubmitButton></form>
        )}
        {!draft && canReassign && (
          <form action={startInterviewAction}><input type="hidden" name="studentId" value={id} /><input type="hidden" name="kind" value="reassignment" />
            <SubmitButton className="rounded-lg border border-border px-4 py-2">{t("reassign")}</SubmitButton></form>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {row(t("email"), <span dir="ltr">{s.email}</span>)}
        {row(t("phone"), <span dir="ltr">{s.phone}</span>)}
        {row(t("city"), s.city)}
        {row(t("institution"), s.institution)}
        {row(t("degree"), [s.degreeType ? tdt(s.degreeType) : null, s.fieldOfStudy].filter(Boolean).join(" · "))}
        {row(t("track"), s.trackName ? `${s.trackName} (${s.targetHours})` : null)}
        {row(t("coordinator"), s.coordinatorName)}
        {row(t("preferredTypes"), s.preferredTypes.map((k) => catLabel.get(k) ?? k).join(", "))}
        {row(t("availableDays"), s.availableDays.map((d) => td(d)).join(", "))}
        {row(t("availableHours"), s.availableHours)}
        {row(t("preferences"), s.generalPreferences)}
        {row(t("studentNotes"), s.studentNotes)}
        {s.nationalId !== undefined && row(t("nationalId"), <span dir="ltr">{s.nationalId}</span>)}
      </dl>
      {fields.length > 0 && <div className="mt-4"><CustomFields fields={fields.map((f) => ({ ...f, canEdit: false }))} values={values} /></div>}

      <h2 className="mt-8 text-lg font-medium">{t("currentPlacements")}</h2>
      {active.length === 0 && <p className="text-muted">{t("noPlacements")}</p>}
      <ul className="mt-2 flex flex-col gap-2">
        {active.map((p) => (
          <li key={p.id} className="rounded-xl border border-border p-3 text-sm">
            <p className="font-medium">{p.placeName} · {p.windowLabel}</p>
            <p>{t("placementLine", { slots: p.slots, weekly: p.weeklyHours, days: p.assignedDays.map((d) => td(d)).join(", ") })}</p>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-lg font-medium">{t("history")}</h2>
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {history.interviews.map((i) => (
          <li key={i.id} className="rounded-xl border border-border p-3">
            <p className="font-medium">{t(`kind.${i.kind}`)} · {i.interviewDate ?? ""} · {ti(`status.${i.status}`)}</p>
            {i.summary && <p className="text-muted">{i.summary}</p>}
            {i.status === "draft" && <Link href={`/interviews/${i.id}`} className="underline">{t("continueDraft")}</Link>}
          </li>
        ))}
        {history.placements.filter((p) => !p.isActive).map((p) => (
          <li key={p.id} className="rounded-xl border border-border p-3 opacity-70">
            {p.placeName} · {p.windowLabel} · {p.startedAt ? formatDay(format, p.startedAt) : ""} – {p.endedAt ? formatDay(format, p.endedAt) : ""}
          </li>
        ))}
      </ul>
    </main>
  );
}
