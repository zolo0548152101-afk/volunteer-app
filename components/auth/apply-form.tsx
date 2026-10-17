"use client";
import Link from "next/link";
import { startTransition, useActionState, useId } from "react";
import { useTranslations } from "next-intl";
import { applyAction, type RegisterState } from "@/lib/actions/student";
import { FormError, Submit } from "./fields";

/**
 * טופס ההרשמה הפתוח. הסעיפים (אקדמי, העדפות, בנק, שדות מותאמים) מגיעים מהשרת כ-children.
 * השליחה ידנית (בלי איפוס טופס של React 19 אחרי פעולה), כדי ששגיאה בשדה אחד לא תמחק את מה שהוקלד.
 */
export function ApplyForm({ children }: { children: React.ReactNode }) {
  const t = useTranslations("register");
  const [state, action, pending] = useActionState<RegisterState, FormData>(applyAction, {});
  const errId = useId();
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }}
      className="mt-4 flex flex-col gap-6"
    >
      {children}
      {/* פיתיון לבוטים: מוסתר מבני אדם ומקוראי מסך */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <FormError id={errId} message={state.error ? t(`errors.${state.error}` as never) : undefined} />
      <Submit pending={pending}>{t("apply")}</Submit>
      <Link href="/login" className="text-sm underline">{t("haveAccount")}</Link>
    </form>
  );
}
