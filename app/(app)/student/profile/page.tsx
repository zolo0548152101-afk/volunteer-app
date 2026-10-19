import { getTranslations } from "next-intl/server";
import { saveSectionAction } from "@/lib/actions/student";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { listFields, loadValues } from "@/lib/services/custom-fields";
import { getMyProfile } from "@/lib/services/students";
import { loadLookup } from "@/lib/services/lookups";
import { AcademicSection, BankSection, PrefsSection } from "@/components/student/sections";
import { CustomFields } from "@/components/custom-fields/custom-fields";
import { ProfileError } from "@/components/student/profile-error";
import { SubmitButton } from "@/components/submit-button";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [{ error }, actor, t] = await Promise.all([searchParams, requireRole("student"), getTranslations("profile")]);
  const [p, types, inst, fields] = await Promise.all([
    getMyProfile(db(), actor), loadLookup(db(), actor.organizationId, "volunteer_type"), loadLookup(db(), actor.organizationId, "institution"),
    listFields(db(), actor, "student"),
  ]);
  const values = await loadValues(db(), actor.organizationId, actor.id, fields);
  const section = (key: "academic" | "prefs" | "bank", body: React.ReactNode, extra?: React.ReactNode) => (
    <form action={saveSectionAction} className="mt-8 flex flex-col gap-3">
      <input type="hidden" name="section" value={key} />
      <input type="hidden" name="back" value="/student/profile" />
      <h2 className="text-lg font-medium">{t(`sections.${key}`)}</h2>
      {body}{extra}
      <SubmitButton className="self-start rounded-lg bg-primary px-4 py-2 text-primary-foreground">{t("save")}</SubmitButton>
    </form>
  );
  return (
    <main className="mx-auto w-full max-w-4xl p-4 lg:p-8">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <ProfileError code={error} />
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        {[[t("track"), p.trackName], [t("targetHours"), p.targetHours], [t("academicYear"), p.academicYearName], [t("coordinator"), p.coordinatorName]].map(([k, v]) => (
          <div key={String(k)} className="rounded-lg border border-border p-2"><dt className="text-muted">{k}</dt><dd className="font-medium">{v ?? t("notSet")}</dd></div>
        ))}
      </dl>
      {section("academic", <AcademicSection p={p} institutions={inst.map((i) => i.label)} />)}
      {section("prefs", <PrefsSection p={p} types={types} />)}
      {section("bank", <BankSection p={p} />, fields.length > 0 ? <><h3 className="mt-2 text-sm font-medium">{t("more")}</h3><CustomFields fields={fields} values={values} /></> : null)}
    </main>
  );
}
