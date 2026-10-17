import { getTranslations } from "next-intl/server";
import { DAYS } from "@/lib/services/places";
import { IdInput } from "@/components/student/id-input";
import type { ProfileData } from "@/lib/services/students";

const input = "rounded-lg border border-border bg-transparent px-3 py-2 text-base";

function T({ label, name, value, type = "text", required = false, inputMode, autoComplete, dir }: {
  label: string; name: string; value?: string | null; type?: string; required?: boolean; inputMode?: "numeric" | "tel"; autoComplete?: string; dir?: "ltr";
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input name={name} type={type} defaultValue={value ?? ""} required={required} inputMode={inputMode} autoComplete={autoComplete} dir={dir} className={input} />
    </label>
  );
}

export async function AcademicSection({ p, institutions, hideId = false }: { p: ProfileData; institutions: string[]; hideId?: boolean }) {
  const t = await getTranslations("profile");
  const dt = await getTranslations("degreeTypes");
  const dy = await getTranslations("degreeYears");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {!hideId && <IdInput label={t("nationalId")} defaultValue={p.nationalId} />}
      <T label={t("dateOfBirth")} name="dateOfBirth" value={p.dateOfBirth} type="date" />
      <T label={t("city")} name="city" value={p.city} autoComplete="address-level2" />
      <label className="flex flex-col gap-1 text-sm">
        {t("institution")}
        <input name="institution" list="institutions" defaultValue={p.institution ?? ""} required className={input} />
        <datalist id="institutions">{institutions.map((i) => <option key={i} value={i} />)}</datalist>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("degreeType")}
        <select name="degreeType" defaultValue={p.degreeType ?? ""} required className={input}>
          <option value="">—</option>
          {(["bachelor", "master", "practical_engineer", "other"] as const).map((k) => <option key={k} value={k}>{dt(k)}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("degreeYear")}
        <select name="degreeYear" defaultValue={p.degreeYear ?? ""} className={input}>
          <option value="">—</option>
          {(["a", "b", "c", "d_plus"] as const).map((k) => <option key={k} value={k}>{dy(k)}</option>)}
        </select>
      </label>
      <T label={t("fieldOfStudy")} name="fieldOfStudy" value={p.fieldOfStudy} />
    </div>
  );
}

export async function PrefsSection({ p, types }: { p: ProfileData; types: { key: string; label: string }[] }) {
  const t = await getTranslations("profile");
  const td = await getTranslations("days");
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-sm">{t("preferredTypes")}</legend>
        {types.map((x) => (
          <label key={x.key} className="flex items-center gap-2 text-sm"><input type="checkbox" name="preferredTypes" value={x.key} defaultChecked={p.preferredTypes.includes(x.key)} /> {x.label}</label>
        ))}
      </fieldset>
      <T label={t("preferredActivities")} name="preferredActivities" value={p.preferredActivities} />
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-sm">{t("availableDays")}</legend>
        {DAYS.map((d) => (
          <label key={d} className="flex items-center gap-2 text-sm"><input type="checkbox" name="availableDays" value={d} defaultChecked={p.availableDays.includes(d)} /> {td(d)}</label>
        ))}
      </fieldset>
      <T label={t("availableHours")} name="availableHours" value={p.availableHours} />
      <label className="flex flex-col gap-1 text-sm">{t("generalPreferences")}<textarea name="generalPreferences" defaultValue={p.generalPreferences ?? ""} rows={2} className={input} /></label>
      <label className="flex flex-col gap-1 text-sm">{t("studentNotes")}<textarea name="studentNotes" defaultValue={p.studentNotes ?? ""} rows={2} className={input} /></label>
    </div>
  );
}

export async function BankSection({ p }: { p: ProfileData }) {
  const t = await getTranslations("profile");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <T label={t("bankName")} name="bankName" value={p.bankName} />
      <T label={t("bankBranch")} name="bankBranch" value={p.bankBranch} inputMode="numeric" dir="ltr" />
      <T label={t("bankAccount")} name="bankAccount" value={p.bankAccount} inputMode="numeric" dir="ltr" />
      <T label={t("accountOwner")} name="accountOwner" value={p.accountOwner} />
    </div>
  );
}
