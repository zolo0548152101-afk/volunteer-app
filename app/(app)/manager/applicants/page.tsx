import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { decideApplicationAction } from "@/lib/actions/applications";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { APPLICATION_STATUSES, countApplications, listApplications, type Applicant, type ApplicationStatus } from "@/lib/services/applications";
import { listFields, loadValuesMany } from "@/lib/services/custom-fields";
import { loadLookup } from "@/lib/services/lookups";
import { formatDay, formatInstant } from "@/lib/date-format";
import { ListView } from "@/components/list-view";
import { dt, Th } from "@/components/data-table";
import { EditDialog } from "@/components/edit-dialog";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { CustomFields } from "@/components/custom-fields/custom-fields";
import { RegisterLink } from "@/components/register-link";
import { Flash } from "@/components/flash";

/**
 * מועמדים מטופס ההרשמה הפתוח: הקישור לשיתוף, טבלת המגישים לפי סטטוס, וכל פרטי המועמד בחלון.
 * "אישור" מעביר את המועמד לתור הראיונות עם כל הפרטים שמילא; "דחייה" משביתה אותו.
 */
export default async function ApplicantsPage({ searchParams }: { searchParams: Promise<{ status?: string; done?: string; error?: string }> }) {
  const actor = await requireRole("manager");
  if (!can(actor, "manage", "user", { organizationId: actor.organizationId })) redirect("/");
  const sp = await searchParams;
  const status: ApplicationStatus = (APPLICATION_STATUSES as string[]).includes(sp.status ?? "") ? (sp.status as ApplicationStatus) : "pending";
  const [t, tp, tdt, tdy, td, format, list, counts, cats] = await Promise.all([
    getTranslations("applicants"), getTranslations("profile"), getTranslations("degreeTypes"), getTranslations("degreeYears"), getTranslations("days"), getFormatter(),
    listApplications(db(), actor, status), countApplications(db(), actor), loadLookup(db(), actor.organizationId, "volunteer_type"),
  ]);
  const fields = (await listFields(db(), actor, "student", "registration")).map((f) => ({ ...f, canEdit: false }));
  const values = await loadValuesMany(db(), actor.organizationId, list.map((a) => a.id), fields);
  const catLabel = new Map(cats.map((c) => [c.key, c.label]));
  const name = (a: Applicant) => `${a.firstName} ${a.lastName}`;
  const degree = (a: Applicant) => [a.degreeType ? tdt(a.degreeType) : null, a.degreeYear ? tdy(a.degreeYear) : null, a.fieldOfStudy].filter(Boolean).join(" · ");
  const days = (a: Applicant) => a.availableDays.map((d) => td(d)).join(", ");
  const search = (a: Applicant) => [name(a), a.email, a.phone, a.city, a.institution, degree(a), days(a)].filter(Boolean).join(" ");
  const row = (k: string, v: React.ReactNode) => <div key={k}><dt className="text-sm text-ink-3">{k}</dt><dd className="mt-0.5">{v || "—"}</dd></div>;

  const decide = (a: Applicant) => (
    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
      {a.status !== "approved" && (
        <form action={decideApplicationAction}>
          <input type="hidden" name="userId" value={a.id} /><input type="hidden" name="decision" value="approved" /><input type="hidden" name="tab" value={status} />
          <SubmitButton className="min-h-11 rounded-lg bg-primary px-5 font-medium text-primary-foreground">{t("approve")}</SubmitButton>
        </form>
      )}
      {a.status !== "rejected" && (
        <form action={decideApplicationAction}>
          <input type="hidden" name="userId" value={a.id} /><input type="hidden" name="decision" value="rejected" /><input type="hidden" name="tab" value={status} />
          <ConfirmSubmit label={t("reject")} message={t("rejectConfirm", { name: name(a) })} confirmLabel={t("reject")} className="min-h-11 rounded-lg border border-bad/50 px-5 text-bad-fg hover:bg-bad-bg" />
        </form>
      )}
      {a.status === "approved" && <Link href={`/students/${a.id}`} className="inline-flex min-h-11 items-center underline">{t("openCard")}</Link>}
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-7xl p-4 lg:p-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-1 text-ink-2">{t("intro")}</p>

      <section aria-labelledby="link-h" className="mt-4 rounded-2xl border border-hairline bg-card p-4 sm:p-5">
        <h2 id="link-h" className="text-lg font-semibold">{t("linkTitle")}</h2>
        <p className="mt-1 mb-3 text-sm text-ink-2">{t("linkHint")}</p>
        <RegisterLink />
        <p className="mt-3 text-sm"><Link href="/manager/custom-fields?page=registration" className="underline">{t("editFields")}</Link></p>
      </section>

      {sp.done && <Flash tone="status" className="mt-4 rounded-lg border border-ok/50 bg-ok-bg p-3 text-ok-fg">{sp.done === "approved" ? t("doneApproved") : t("doneRejected")}</Flash>}
      {sp.error && <Flash tone="error" className="mt-4 rounded-lg border border-bad/50 bg-bad-bg p-3 text-bad-fg">{t("error")}</Flash>}

      <nav aria-label={t("statusNav")} className="mt-6 flex flex-wrap gap-2">
        {APPLICATION_STATUSES.map((s) => (
          <Link key={s} href={`/manager/applicants?status=${s}`} aria-current={s === status ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm ${s === status ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-paper"}`}>
            {t(`status.${s}`)} <span className={`rounded-full px-2 text-xs font-semibold ${s === status ? "bg-white/20" : "bg-paper"}`}>{counts[s]}</span>
          </Link>
        ))}
      </nav>

      {list.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-ink-2">{t(`empty.${status}`)}</p> : (
        <ListView storageKey="applicants" placeholder={t("searchPlaceholder")} table={(
          <table className={dt.table}>
            <thead className={dt.head}><tr>
              <Th sort="text">{t("col.name")}</Th><Th sort="text" className="hidden md:table-cell">{t("col.phone")}</Th><Th sort="text">{t("col.city")}</Th>
              <Th sort="text" className="hidden lg:table-cell">{t("col.studies")}</Th><Th className="hidden lg:table-cell">{t("col.days")}</Th><Th sort="text">{t("col.submitted")}</Th>
              <th scope="col" className="px-3 py-2"><span className="sr-only">{t("details")}</span></th>
            </tr></thead>
            <tbody className={dt.body}>
              {list.map((a) => (
                <tr key={a.id} data-search={search(a)}>
                  <th scope="row" className={`${dt.td} text-start font-medium`}><span className="block">{name(a)}</span><span className="block text-xs font-normal text-ink-3"><bdi dir="ltr">{a.email}</bdi></span></th>
                  <td className={`${dt.td} hidden md:table-cell`}><bdi dir="ltr">{a.phone}</bdi></td>
                  <td className={dt.td}>{a.city ?? "—"}</td>
                  <td className={`${dt.td} hidden lg:table-cell`}>{[a.institution, degree(a)].filter(Boolean).join(" · ") || "—"}</td>
                  <td className={`${dt.td} hidden lg:table-cell`}>{days(a) || "—"}</td>
                  <td className={`${dt.td} whitespace-nowrap`} data-v={a.submittedAt.toISOString()}>{formatInstant(format, a.submittedAt)}</td>
                  <td className={`${dt.actions} text-end`}>
                    <EditDialog label={status === "pending" ? t("review") : t("details")} title={name(a)}
                      className={status === "pending" ? "inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground md:min-h-9" : undefined}>
                      <dl className="grid gap-4 sm:grid-cols-2">
                        {row(t("col.contact"), <><bdi dir="ltr">{a.email}</bdi><br /><bdi dir="ltr">{a.phone}</bdi></>)}
                        {row(tp("nationalId"), a.nationalId && <bdi dir="ltr">{a.nationalId}</bdi>)}
                        {row(tp("dateOfBirth"), a.dateOfBirth ? formatDay(format, a.dateOfBirth) : null)}
                        {row(tp("city"), a.city)}
                        {row(tp("institution"), a.institution)}
                        {row(t("col.studies"), degree(a))}
                        {row(tp("preferredTypes"), a.preferredTypes.map((k) => catLabel.get(k) ?? k).join(", "))}
                        {row(tp("availableDays"), days(a))}
                        {row(tp("availableHours"), a.availableHours)}
                        {row(tp("preferredActivities"), a.preferredActivities)}
                        {row(tp("generalPreferences"), a.generalPreferences)}
                        {row(tp("studentNotes"), a.studentNotes)}
                      </dl>
                      {fields.length > 0 && <div className="mt-4 border-t border-hairline pt-4"><CustomFields fields={fields} values={values.get(a.id) ?? {}} /></div>}
                      <p className="mt-4 text-sm text-ink-3">{t("submittedOn", { date: formatInstant(format, a.submittedAt) })}{a.decidedAt ? ` · ${t("decidedOn", { date: formatInstant(format, a.decidedAt) })}` : ""}</p>
                      {decide(a)}
                    </EditDialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )} />
      )}
    </main>
  );
}
