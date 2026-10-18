import { getTranslations } from "next-intl/server";
import { saveFieldAction } from "@/lib/actions/settings";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { FIELD_TYPES, listAllFields } from "@/lib/services/custom-field-admin";
import { effectivePage, PAGES, type PageKey } from "@/lib/services/custom-fields";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { MultiSelect } from "@/components/multi-select";
import { EditDialog } from "@/components/edit-dialog";
import { Flash } from "@/components/flash";

const input = "rounded-lg border border-border bg-background px-3 py-2";
const ROLES = ["student", "coordinator", "interviewer", "manager"] as const;
const KNOWN = ["invalid", "name_required", "not_found", "forbidden", "generic"];

export default async function CustomFieldsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; page?: string }> }) {
  const [sp, t, tr, actor] = await Promise.all([searchParams, getTranslations("customFieldsAdmin"), getTranslations("roles"), requireRole("manager")]);
  const fields = await listAllFields(db(), actor);
  const current: PageKey = PAGES.some((p) => p.key === sp.page) ? (sp.page as PageKey) : "registration";
  const meta = PAGES.find((p) => p.key === current)!;
  const onPage = (k: PageKey) => fields.filter((f) => effectivePage(f.entity, f.page) === k);
  const orphans = fields.filter((f) => effectivePage(f.entity, f.page) === null);
  const form = (f: (typeof fields)[number] | null, entity: string, page: PageKey | null) => (
    <form key={f?.id ?? `new-${entity}`} action={saveFieldAction} className="grid grid-cols-2 gap-3 text-sm">
      {f && <input type="hidden" name="id" value={f.id} />}
      <input type="hidden" name="entity" value={entity} />
      {f && page && PAGES.filter((x) => x.entity === entity).length > 1 ? (
        <label className="col-span-2 flex flex-col gap-1">{t("movePage")}
          <select name="page" defaultValue={page} className={`${input} min-h-11`}>{PAGES.filter((x) => x.entity === entity).map((x) => <option key={x.key} value={x.key}>{t(`pages.${x.key}.title`)}</option>)}</select>
        </label>
      ) : page && <input type="hidden" name="page" value={page} />}
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
      <MultiSelect className="col-span-2" name="visibleToRoles" label={t("visibleTo")} options={ROLES.map((r) => ({ value: r, label: tr(r), disabled: r === "manager" }))} defaultValue={f ? f.visibleToRoles : ["manager"]} />
      <MultiSelect className="col-span-2" name="editableByRoles" label={t("editableBy")} options={ROLES.map((r) => ({ value: r, label: tr(r), disabled: r === "manager" }))} defaultValue={f ? f.editableByRoles : ["manager"]} />
      <label className="flex items-center gap-2"><input type="checkbox" name="required" defaultChecked={f?.required} />{t("required")}</label>
      {f && <label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked={f.isActive} />{t("active")}</label>}
      <SubmitButton className="col-span-2 min-h-11 self-start rounded-lg bg-primary px-4 py-2 text-primary-foreground">{f ? t("save") : t("add")}</SubmitButton>
    </form>
  );
  const builtin = t.raw(`pages.${current}.builtin`) as string[];
  return (
    <main className="mx-auto w-full max-w-5xl p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      {sp.saved && <Flash tone="status" className="mt-3 rounded-lg border border-ok/50 p-2 text-sm text-ok-fg">{t("saved")}</Flash>}
      {sp.error && KNOWN.includes(sp.error) && <Flash tone="error" className="mt-3 rounded-lg border border-bad/50 p-3 text-sm text-bad-fg">{t(`errors.${sp.error}`)}</Flash>}

      <nav aria-label={t("chooseTitle")} className="mt-4">
        <p className="text-sm font-medium">{t("chooseTitle")}</p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          {PAGES.map((p) => (
            <li key={p.key}>
              <Link href={`/manager/custom-fields?page=${p.key}`} aria-current={p.key === current ? "page" : undefined}
                className={`flex min-h-14 flex-col justify-center rounded-xl border px-3 py-2 text-sm ${p.key === current ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                <span className="font-medium">{t(`pages.${p.key}.title`)}</span>
                <span className="text-xs">{t("fieldCount", { n: onPage(p.key).filter((f) => f.isActive).length })}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section className="mt-6" aria-labelledby="page-h">
        <h2 id="page-h" className="text-lg font-medium">{t(`pages.${current}.title`)}</h2>
        <p className="mt-1 text-sm text-muted">{t(`pages.${current}.where`)}</p>

        <h3 className="mt-4 text-sm font-medium">{t("alreadyThere")}</h3>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {builtin.map((b) => <li key={b} className="rounded-full border border-border px-3 py-1">{b}</li>)}
          {onPage(current).filter((f) => f.isActive).map((f) => <li key={f.id} className="rounded-full border border-primary/60 px-3 py-1">{f.labelHe} <span className="text-xs text-muted">({t("custom")})</span></li>)}
        </ul>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-medium">{t("manageExisting")}</h3>
          <EditDialog label={`＋ ${t("addToPage", { page: t(`pages.${current}.title`) })}`} title={t("addToPage", { page: t(`pages.${current}.title`) })} className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
            {form(null, meta.entity, current)}
          </EditDialog>
        </div>
        <div role="region" aria-label={t("manageExisting")} tabIndex={0} className="mt-2 overflow-x-auto rounded-xl border border-hairline bg-card">
          <table className="w-full text-sm">
            <thead className="bg-paper text-xs text-ink-3"><tr>
              <th scope="col" className="px-3 py-2 text-start font-medium">{t("labelHe")}</th>
              <th scope="col" className="hidden px-3 py-2 text-start font-medium sm:table-cell">{t("type")}</th>
              <th scope="col" className="hidden px-3 py-2 text-start font-medium sm:table-cell">{t("required")}</th>
              <th scope="col" className="hidden px-3 py-2 text-start font-medium sm:table-cell">{t("editableBy")}</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">{t("statusCol")}</th>
              <th scope="col" className="px-3 py-2"><span className="sr-only">{t("editRow")}</span></th>
            </tr></thead>
            <tbody className="divide-y divide-hairline">
              {onPage(current).length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-ink-3">{t("noneYet")}</td></tr>}
              {onPage(current).map((f) => (
                <tr key={f.id}>
                  <th scope="row" className="px-3 py-2 text-start font-medium">{f.labelHe}</th>
                  <td className="hidden px-3 py-2 sm:table-cell">{t(`types.${f.type}`)}</td>
                  <td className="hidden px-3 py-2 sm:table-cell">{f.required ? "✓" : "—"}</td>
                  <td className="hidden px-3 py-2 sm:table-cell">{f.editableByRoles.map((r) => tr(r)).join(", ") || "—"}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${f.isActive ? "bg-ok-bg text-ok-fg" : "bg-paper text-ink-3"}`}>{f.isActive ? t("active") : t("inactive")}</span></td>
                  <td className="px-3 py-2 text-end"><EditDialog label={t("editRow")} title={f.labelHe}>{form(f, f.entity, current)}</EditDialog></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {orphans.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-medium">{t("orphansTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("orphansHint")}</p>
          <ul className="mt-2 list-disc ps-5 text-sm">{orphans.map((f) => <li key={f.id}>{f.labelHe} · {t(`entities.${f.entity}`)}</li>)}</ul>
        </section>
      )}
    </main>
  );
}
