import { getTranslations } from "next-intl/server";
import type { StaffPlace } from "@/lib/services/places";

const input = "rounded-lg border border-border bg-transparent px-3 py-2 text-base";

export async function PlaceFields({ place, categories }: { place?: StaffPlace; categories: { key: string; label: string }[] }) {
  const t = await getTranslations("places");
  const f = (name: string, label: string, value?: string | null, type = "text", required = false) => (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input name={name} type={type} defaultValue={value ?? ""} required={required} className={input} />
    </label>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {f("name", t("name"), place?.name, "text", true)}
      {f("city", t("city"), place?.city)}
      {f("address", t("address"), place?.address)}
      <label className="flex flex-col gap-1 text-sm">
        {t("category")}
        <select name="category" defaultValue={place?.category ?? ""} className={input}>
          <option value="">{t("noCategory")}</option>
          {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </label>
      {f("contactName", t("contactName"), place?.contactName)}
      {f("contactPhone", t("contactPhone"), place?.contactPhone, "tel")}
      {f("contactEmail", t("contactEmail"), place?.contactEmail, "email")}
      {place && (
        <label className="flex flex-col gap-1 text-sm">
          {t("statusLabel")}
          <select name="status" defaultValue={place.status} className={input}>
            {(["active", "paused", "closed"] as const).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        {t("description")}
        <textarea name="description" defaultValue={place?.description ?? ""} rows={2} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        {t("notes")}
        <textarea name="notes" defaultValue={place?.notes ?? ""} rows={2} className={input} />
      </label>
    </div>
  );
}
