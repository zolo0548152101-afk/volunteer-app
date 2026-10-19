"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export type MultiOption = { value: string; label: string; hint?: string; disabled?: boolean };

/**
 * שדה בחירה מרובה (במקום שורת תיבות סימון): מציג את הבחירה כתגיות עם ×, ופותח רשימה לסימון/חיפוש.
 * שולח את הערכים כמו תיבות סימון רגילות (אותו name, כמה ערכים), ולכן שום פעולת שרת לא משתנה.
 * ערך שסומן כ-disabled נשאר מוצג וננעל, ולא נשלח (כמו תיבת סימון מושבתת).
 */
export function MultiSelect({ name, label, options, defaultValue = [], placeholder, searchable, className }: {
  name: string; label: string; options: MultiOption[]; defaultValue?: string[]; placeholder?: string; searchable?: boolean; className?: string;
}) {
  const t = useTranslations("multiSelect");
  const [sel, setSel] = useState<string[]>(defaultValue);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const byValue = new Map(options.map((o) => [o.value, o]));
  const chosen = options.filter((o) => sel.includes(o.value));
  const showSearch = searchable ?? options.length > 8;
  const needle = q.trim().toLocaleLowerCase();
  const list = needle ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLocaleLowerCase().includes(needle)) : options;

  useEffect(() => {
    if (!open) return;
    // "click" ולא "mousedown": הרשימה פתוחה בתוך הזרימה, וסגירה באמצע לחיצה מזיזה את הכפתור מתחת לעכבר
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", away);
    return () => document.removeEventListener("click", away);
  }, [open]);

  const toggle = (v: string) => setSel((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  const hidden = sel.filter((v) => !byValue.get(v)?.disabled).map((v) => <input key={v} type="hidden" name={name} value={v} />);

  // עד 4 אפשרויות (שפות, ערוצים, תפקידים): כולן גלויות כתגיות בחירה, בלחיצה אחת
  if (options.length <= 4 && !searchable) {
    return (
      <fieldset className={`min-w-0 text-sm ${className ?? ""}`}>
        <legend className="mb-1 block text-xs text-ink-3">{label}</legend>
        {hidden}
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const on = sel.includes(o.value);
            return (
              <button key={o.value} type="button" aria-pressed={on} disabled={o.disabled} onClick={() => toggle(o.value)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors duration-150 disabled:opacity-60 ${on ? "border-primary bg-info-bg font-medium text-info-fg" : "border-border bg-card hover:bg-paper"}`}>
                <span aria-hidden="true">{on ? "✓" : ""}</span>{o.label}{o.hint && <span className="text-xs text-ink-3">({o.hint})</span>}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }

  return (
    <div ref={root} className={`min-w-0 text-sm ${className ?? ""}`} onKeyDown={(e) => { if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); } }}>
      <span id={`${id}-l`} className="mb-1 block text-xs text-ink-3">{label}</span>
      {hidden}
      {/* כל השדה נלחץ ופותח את הרשימה; ה-× בתגית מסיר ערך בלי לפתוח */}
      <div onClick={(e) => { if (!(e.target as HTMLElement).closest("[data-chip]")) setOpen((o) => !o); }}
        className="flex min-h-11 cursor-pointer flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 hover:bg-paper/60">
        {chosen.length === 0 && <span className="px-1 text-ink-3">{placeholder ?? t("none")}</span>}
        {chosen.map((o) => (
          <span key={o.value} data-chip className="inline-flex items-center gap-1 rounded-full bg-info-bg py-0.5 ps-2.5 pe-1 text-xs font-medium text-info-fg">
            {o.label}
            {!o.disabled && <button type="button" onClick={() => toggle(o.value)} aria-label={t("remove", { name: o.label })} className="grid size-6 place-items-center rounded-full text-sm leading-none hover:bg-black/10">×</button>}
          </span>
        ))}
        <button type="button" aria-expanded={open} aria-controls={`${id}-p`} aria-labelledby={`${id}-l`}
          className="ms-auto grid min-h-9 min-w-9 place-items-center rounded-md px-2 text-ink-2"><span aria-hidden="true" className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}>▾</span></button>
      </div>
      {open && (
        <fieldset id={`${id}-p`} className="mt-1 rounded-lg border border-border bg-card p-2">
          <legend className="sr-only">{label}</legend>
          {showSearch && <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="mb-2 min-h-11 w-full rounded-md border border-border bg-transparent px-2 text-sm" />}
          <div className="max-h-56 overflow-y-auto">
            {list.length === 0 && <p className="px-2 py-2 text-ink-3">{t("noResults")}</p>}
            {list.map((o) => (
              <label key={o.value} className={`flex min-h-11 items-center gap-2.5 rounded-md px-2 ${o.disabled ? "opacity-60" : "cursor-pointer hover:bg-paper"}`}>
                <input type="checkbox" checked={sel.includes(o.value)} disabled={o.disabled} onChange={() => toggle(o.value)} className="size-4" />
                <span>{o.label}</span>{o.hint && <span className="ms-auto text-xs text-ink-3">{o.hint}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
