"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * חלון קופץ לעריכה (dialog מקורי: פוקוס כלוא, Esc סוגר, רקע מוחשך).
 * התוכן הוא טפסי server-action שנבנו בשרת; אחרי שליחה תקינה החלון נסגר והעמוד נטען מחדש.
 */
export function EditDialog({ label, title, children, className, closeOnSubmit = true }: { label: string; title: string; children: ReactNode; className?: string; closeOnSubmit?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  // טפסים של צד לקוח (שמציגים שגיאה בתוך הטופס) סוגרים את החלון רק אחרי הצלחה, באירוע "dialogdone"
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const done = () => el.close();
    el.addEventListener("dialogdone", done);
    return () => el.removeEventListener("dialogdone", done);
  }, []);
  const id = useId();
  const t = useTranslations("common");
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={className ?? "inline-flex min-h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-paper"}>{label}</button>
      <dialog
        ref={ref}
        aria-labelledby={id}
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
        onSubmit={() => { if (closeOnSubmit) setTimeout(() => ref.current?.close(), 0); }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl flex-col overflow-hidden rounded-2xl border border-hairline bg-card p-0 text-ink backdrop:bg-black/60 open:flex"
      >
        <div className="flex flex-none items-center justify-between gap-3 border-b border-hairline px-5 py-3">
          <h2 id={id} className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label={t("close")} className="grid size-9 place-items-center rounded-md text-lg hover:bg-paper">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm">{children}</div>
      </dialog>
    </>
  );
}
