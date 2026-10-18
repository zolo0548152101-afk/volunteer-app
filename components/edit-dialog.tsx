"use client";
import { useId, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * חלון קופץ לעריכה (dialog מקורי: פוקוס כלוא, Esc סוגר, רקע מוחשך).
 * התוכן הוא טפסי server-action שנבנו בשרת; אחרי שליחה תקינה החלון נסגר והעמוד נטען מחדש.
 */
export function EditDialog({ label, title, children, className }: { label: string; title: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const t = useTranslations("common");
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={className ?? "inline-flex min-h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-paper"}>{label}</button>
      <dialog
        ref={ref}
        aria-labelledby={id}
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
        onSubmit={() => setTimeout(() => ref.current?.close(), 0)}
        className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-2xl border border-hairline bg-card p-0 text-ink backdrop:bg-black/60"
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3">
          <h2 id={id} className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label={t("close")} className="grid size-9 place-items-center rounded-md text-lg hover:bg-paper">×</button>
        </div>
        <div className="max-h-[75dvh] overflow-y-auto px-5 py-4 text-sm">{children}</div>
      </dialog>
    </>
  );
}
