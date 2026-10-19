import { notFound } from "next/navigation";
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

const STEPS = ["academic", "prefs", "bank"] as const;

export default async function SetupStep({ params, searchParams }: { params: Promise<{ step: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ step }, { error }, actor, t] = await Promise.all([params, searchParams, requireRole("student"), getTranslations("register")]);
  const n = Number(step);
  if (!Number.isInteger(n) || n < 1 || n > STEPS.length) notFound();
  const section = STEPS[n - 1];
  const [p, types, inst, fields] = await Promise.all([
    getMyProfile(db(), actor), loadLookup(db(), actor.organizationId, "volunteer_type"), loadLookup(db(), actor.organizationId, "institution"),
    listFields(db(), actor, "student", "registration"),
  ]);
  const last = n === STEPS.length;
  const values = last ? await loadValues(db(), actor.organizationId, actor.id, fields) : {};
  return (
    <main className="mx-auto w-full max-w-3xl p-4 lg:p-8">
      <p className="text-sm text-muted" aria-live="polite">{t("stepOf", { n, total: STEPS.length })}</p>
      <h1 className="mt-1 text-xl font-semibold">{t(`step.${section}`)}</h1>
      <ProfileError code={error} />
      <form action={saveSectionAction} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="section" value={section} />
        <input type="hidden" name="back" value={`/student/setup/${n}`} />
        <input type="hidden" name="next" value={last ? "/student" : `/student/setup/${n + 1}`} />
        {last && <input type="hidden" name="finish" value="1" />}
        {section === "academic" && <AcademicSection p={p} institutions={inst.map((i) => i.label)} />}
        {section === "prefs" && <PrefsSection p={p} types={types} />}
        {section === "bank" && <BankSection p={p} />}
        {last && <CustomFields fields={fields} values={values} />}
        <div className="flex gap-3">
          {n > 1 && <a href={`/student/setup/${n - 1}`} className="rounded-lg border border-border px-4 py-2.5">{t("back")}</a>}
          <SubmitButton className="flex-1 rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground">{last ? t("finish") : t("next")}</SubmitButton>
        </div>
      </form>
    </main>
  );
}
