"use client";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * כרטיס מידע עם מצב עריכה במקום: צפייה רגילה, ולחיצה על "עריכה" פותחת את השדות עם "שמירה" ו"ביטול".
 * לשדה בודד או שורה משתמשים ב-EditDialog; כאן לקבוצת שדות.
 */
export function InlineEdit({ title, view, form, canEdit = true, id }: { title: string; view: ReactNode; form: ReactNode; canEdit?: boolean; id?: string }) {
  const t = useTranslations("common");
  const [editing, setEditing] = useState(false);
  return (
    <section id={id} aria-labelledby={`${id ?? title}-h`} className="rounded-xl border border-hairline bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id ?? title}-h`} className="text-sm font-semibold">{title}</h2>
        {canEdit && !editing && <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-paper">{t("edit")}</button>}
      </div>
      {editing ? (
        <div className="mt-3" onSubmit={() => setTimeout(() => setEditing(false), 0)}>
          {form}
          <div className="mt-1"><button type="button" onClick={() => setEditing(false)} className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm hover:bg-paper">{t("cancel")}</button></div>
        </div>
      ) : <div className="mt-3">{view}</div>}
    </section>
  );
}
