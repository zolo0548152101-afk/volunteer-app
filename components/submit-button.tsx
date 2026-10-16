"use client";
import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

/**
 * כפתור שליחה לטפסי server-action: בזמן השליחה הוא נעול ומציג "שולחים…", כך שלחיצה כפולה
 * לא יוצרת פעולה כפולה (שורת שיבוץ, אישור, דיווח).
 */
export function SubmitButton({ children, disabled, ...rest }: ComponentProps<"button">) {
  const { pending } = useFormStatus();
  const t = useTranslations("common");
  return (
    <button {...rest} type="submit" disabled={pending || disabled} aria-busy={pending} className={`${rest.className ?? ""} disabled:opacity-60`}>
      {pending ? t("sending") : children}
    </button>
  );
}
