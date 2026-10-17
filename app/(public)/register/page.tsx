import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/shell";
import { ApplyForm } from "@/components/auth/apply-form";
import { Field } from "@/components/auth/fields";
import { AcademicSection, BankSection, PrefsSection } from "@/components/student/sections";
import { CustomFields } from "@/components/custom-fields/custom-fields";
import { db } from "@/lib/db";
import { listFields } from "@/lib/services/custom-fields";
import { loadLookup } from "@/lib/services/lookups";
import { registrationOrgId } from "@/lib/services/students";
import type { ProfileData } from "@/lib/services/students";

const EMPTY: ProfileData = {
  nationalId: null, dateOfBirth: null, city: null, institution: null, degreeType: null, degreeYear: null, fieldOfStudy: null, preferredTypes: [],
  preferredActivities: null, availableDays: [], availableHours: null, generalPreferences: null, studentNotes: null, bankName: null, bankBranch: null,
  bankAccount: null, accountOwner: null, bankDocument: null, profileCompletedAt: null, trackName: null, targetHours: null, academicYearName: null, coordinatorName: null,
};

/** טופס הרשמה פתוח לתוכנית ההתנדבות: בלי חשבון. קישור כניסה נשלח אחרי הראיון. */
export default async function RegisterPage() {
  const t = await getTranslations("register");
  const orgId = await registrationOrgId(db());
  const [types, inst, fields] = await Promise.all([
    loadLookup(db(), orgId, "volunteer_type"), loadLookup(db(), orgId, "institution"),
    listFields(db(), { id: "", organizationId: orgId, roles: ["student"] }, "student", "registration"),
  ]);
  const editable = fields.filter((f) => f.canEdit);
  const sec = (title: string, body: React.ReactNode) => (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="text-base font-medium">{title}</h2>
      {body}
    </section>
  );
  return (
    <AuthShell title={t("title")} wide>
      <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      <ApplyForm>
        {sec(t("section.contact"), (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("firstName")} name="firstName" autoComplete="given-name" />
              <Field label={t("lastName")} name="lastName" autoComplete="family-name" />
            </div>
            <Field label={t("email")} name="email" type="email" autoComplete="email" />
            <Field label={t("phone")} name="phone" type="tel" autoComplete="tel" />
          </div>
        ))}
        {sec(t("step.academic"), <AcademicSection p={EMPTY} institutions={inst.map((i) => i.label)} />)}
        {sec(t("step.prefs"), <PrefsSection p={EMPTY} types={types} />)}
        {sec(t("step.bank"), <BankSection p={EMPTY} />)}
        {editable.length > 0 && sec(t("section.more"), <CustomFields fields={editable} values={{}} />)}
      </ApplyForm>
    </AuthShell>
  );
}
