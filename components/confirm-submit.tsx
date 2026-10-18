"use client";
import { useId, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * כפתור פעולה הרסנית עם שלב אישור (D2). חייב לשבת בתוך <form>: האישור שולח את הטופס.
 * לחיצה אחת רק פותחת את שאלת האישור; הכפתור האדום מופרד מ"ביטול".
 */
export function ConfirmSubmit({ label, message, confirmLabel, className }: { label: ReactNode; message: string; confirmLabel: string; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const t = useTranslations("common");
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={className}>{label}</button>
      <dialog ref={ref} aria-labelledby={id} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-hairline bg-card p-5 text-ink backdrop:bg-black/60">
        <p id={id} className="text-base font-semibold">{message}</p>
        <div className="mt-5 flex flex-wrap justify-between gap-3">
          <button type="button" onClick={() => ref.current?.close()} className="min-h-11 rounded-lg border border-border px-5 text-sm hover:bg-paper">{t("cancel")}</button>
          <button type="submit" className="min-h-11 rounded-lg bg-bad px-5 text-sm font-medium text-white">{confirmLabel}</button>
        </div>
      </dialog>
    </>
  );
}
