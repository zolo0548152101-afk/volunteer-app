import { getLocale } from "next-intl/server";
import type { FieldDef, FieldValue } from "@/lib/services/custom-fields";

const input = "rounded-lg border border-border bg-transparent px-3 py-2 text-base";

/** רינדור גנרי של שדות מותאמים. שמות שדות: cf_<fieldId>. שדה לקריאה בלבד מוצג כטקסט. */
export async function CustomFields({ fields, values }: { fields: FieldDef[]; values: Record<string, FieldValue> }) {
  const locale = await getLocale();
  if (fields.length === 0) return null;
  const label = (f: FieldDef) => (locale === "en" && f.labelEn ? f.labelEn : f.labelHe);
  const optLabel = (o: FieldDef["options"][number]) => (locale === "en" && o.label_en ? o.label_en : o.label_he);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => {
        const v = values[f.id] ?? null;
        const name = `cf_${f.id}`;
        if (!f.canEdit) {
          const shown = Array.isArray(v) ? v.map((k) => f.options.find((o) => o.key === k)).map((o) => (o ? optLabel(o) : "")).join(", ")
            : f.type === "select" ? (f.options.find((o) => o.key === v) ? optLabel(f.options.find((o) => o.key === v)!) : "")
            : f.type === "boolean" ? (v ? "✓" : "—") : v === null ? "—" : String(v);
          return (<div key={f.id} className="text-sm"><p className="text-muted">{label(f)}</p><p>{shown || "—"}</p></div>);
        }
        return (
          <label key={f.id} className="flex flex-col gap-1 text-sm">
            {label(f)}{f.required && " *"}
            {f.type === "select" ? (
              <select name={name} defaultValue={(v as string) ?? ""} required={f.required} className={input}>
                <option value="">—</option>
                {f.options.map((o) => <option key={o.key} value={o.key}>{optLabel(o)}</option>)}
              </select>
            ) : f.type === "multi_select" ? (
              <span className="flex flex-wrap gap-3">
                {f.options.map((o) => (
                  <span key={o.key} className="flex items-center gap-1"><input type="checkbox" name={name} value={o.key} defaultChecked={Array.isArray(v) && v.includes(o.key)} /> {optLabel(o)}</span>
                ))}
                <input type="hidden" name={name} value="" />
              </span>
            ) : f.type === "boolean" ? (
              <span className="flex items-center gap-2"><input type="hidden" name={name} value="0" /><input type="checkbox" name={name} value="1" defaultChecked={v === true} /></span>
            ) : f.type === "number" ? (
              <input name={name} type="number" step="any" defaultValue={v === null ? "" : String(v)} required={f.required} className={input} />
            ) : f.type === "date" ? (
              <input name={name} type="date" defaultValue={(v as string) ?? ""} required={f.required} className={input} />
            ) : (
              <input name={name} type="text" defaultValue={v === null ? "" : String(v)} required={f.required} className={input} />
            )}
          </label>
        );
      })}
    </div>
  );
}
