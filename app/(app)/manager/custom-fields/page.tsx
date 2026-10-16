import { getTranslations } from "next-intl/server";
import { saveFieldAction } from "@/lib/actions/settings";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { ENTITIES, FIELD_TYPES, listAllFields } from "@/lib/services/custom-field-admin";
import { SubmitButton } from "@/components/submit-button";

const input = "rounded-lg border border-border bg-background px-3 py-2";
const ROLES = ["student", "coordinator", "interviewer", "manager"] as const;
const KNOWN = ["invalid", "name_required", "not_found", "forbidden", "generic"];

export default async function CustomFieldsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [sp, t, tr, actor] = await Promise.all([searchParams, getTranslations("customFieldsAdmin"), getTranslations("roles"), requireRole("manager")]);
  const fields = await listAllFields(db(), actor);
  const form = (f: (typeof fields)[number] | null, entity: string) => (
    <form key={f?.id ?? `new-${entity}`} action={saveFieldAction} className={`grid grid-cols-2 gap-3 rounded-xl border p-3 text-sm ${f ? "border-border" : "border-dashed border-border"}`}>
      {f && <input type="hidden" name="id" value={f.id} />}
      <input type="hidden" name="entity" value={entity} />
      <label className="flex flex-col gap-1">{t("labelHe")}<input name="labelHe" required defaultValue={f?.labelHe} className={input} /></label>
      <label className="flex flex-col gap-1">{t("labelEn")}<input name="labelEn" defaultValue={f?.labelEn ?? ""} className={input} dir="ltr" /></label>
      <label className="flex flex-col gap-1">{t("type")}
        {f ? <span className="py-2">{t(`types.${f.type}`)}</span>
          : <select name="type" className={input}>{FIELD_TYPES.map((x) => <option key={x} value={x}>{t(`types.${x}`)}</option>)}</select>}
      </label>
      <label className="flex flex-col gap-1">{t("sortOrder")}<input name="sortOrder" type="number" defaultValue={f?.sortOrder ?? 0} className={input} /></label>
      {(!f || f.type === "select" || f.type === "multi_select") && (
        <label className="col-span-2 flex flex-col gap-1">{t("options")}<textarea name="options" rows={3} defaultValue={(f?.options ?? []).map((o) => (o.label_en ? `${o.label_he} | ${o.label_en}` : o.label_he)).join("\n")} className={input} /><span className="text-xs text-muted">{t("optionsHint")}</span></label>
      )}
      <fieldset className="flex flex-wrap gap-3"><legend>{t("visibleTo")}</legend>
        {ROLES.map((r) => <label key={r} className="flex items-center gap-1"><input type="checkbox" name="visibleToRoles" value={r} defaultChecked={f ? f.visibleToRoles.includes(r) : r === "manager"} disabled={r === "manager"} />{tr(r)}</label>)}
      </fieldset>
      <fieldset className="flex flex-wrap gap-3"><legend>{t("editableBy")}</legend>
        {ROLES.map((r) => <label key={r} className="flex items-center gap-1"><input type="checkbox" name="editableByRoles" value={r} defaultChecked={f ? f.editableByRoles.includes(r) : r === "manager"} disabled={r === "manager"} />{tr(r)}</label>)}
      </fieldset>
      <label className="flex items-center gap-2"><input type="checkbox" name="required" defaultChecked={f?.required} />{t("required")}</label>
      {f && <label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked={f.isActive} />{t("active")}</label>}
      <SubmitButton className="col-span-2 self-start rounded-lg bg-primary px-4 py-2 text-primary-foreground">{f ? t("save") : t("add")}</SubmitButton>
    </form>
  );
  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      {sp.saved && <p role="status" className="mt-3 rounded-lg border border-green-300 p-2 text-sm text-green-800">{t("saved")}</p>}
      {sp.error && KNOWN.includes(sp.error) && <p role="alert" className="mt-3 rounded-lg border border-red-300 p-3 text-sm text-red-700">{t(`errors.${sp.error}`)}</p>}
      {ENTITIES.map((e) => (
        <section key={e} className="mt-8">
          <h2 className="text-lg font-medium">{t(`entities.${e}`)}</h2>
          <div className="mt-3 flex flex-col gap-3">
            {fields.filter((f) => f.entity === e).map((f) => form(f, e))}
            {form(null, e)}
          </div>
        </section>
      ))}
    </main>
  );
}
