import { getTranslations } from "next-intl/server";
import { DAYS, type WindowView } from "@/lib/services/places";

const input = "rounded-lg border border-border bg-transparent px-3 py-2 text-base";

export async function WindowFields({ w }: { w?: WindowView }) {
  const t = await getTranslations("places");
  const td = await getTranslations("days");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        {t("windowLabel")}
        <input name="label" defaultValue={w?.label ?? ""} required className={input} />
      </label>
      <fieldset className="flex flex-wrap gap-3 sm:col-span-2">
        <legend className="mb-1 text-sm">{t("days")}</legend>
        {DAYS.map((d) => (
          <label key={d} className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="days" value={d} defaultChecked={w?.days.includes(d)} /> {td(d)}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">{t("from")}<input name="startTime" type="time" dir="ltr" defaultValue={w?.startTime?.slice(0, 5) ?? ""} className={input} /></label>
      <label className="flex flex-col gap-1 text-sm">{t("to")}<input name="endTime" type="time" dir="ltr" defaultValue={w?.endTime?.slice(0, 5) ?? ""} className={input} /></label>
      <label className="flex flex-col gap-1 text-sm">{t("slots")}<input name="slots" type="number" step="0.25" min="0" defaultValue={w?.slots ?? ""} required className={input} /></label>
      <label className="flex flex-col gap-1 text-sm">{t("hoursPerSlot")}<input name="hoursPerSlot" type="number" step="0.25" min="0.25" defaultValue={w?.hoursPerSlot ?? ""} required className={input} /></label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">{t("task")}<input name="taskDescription" defaultValue={w?.taskDescription ?? ""} className={input} /></label>
    </div>
  );
}
