"use client";
import Link from "next/link";
import { useActionState, useId } from "react";
import { useTranslations } from "next-intl";
import { registerAction, type RegisterState } from "@/lib/actions/student";
import { Field, FormError, Submit } from "./fields";

export function RegisterForm() {
  const t = useTranslations("register");
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAction, {});
  const errId = useId();
  // שגיאה שמתייחסת לשדה מסוים מחוברת אליו; שגיאה כללית (מכסה, הרשמה סגורה) נשארת הודעה בלבד
  const on = (...codes: string[]) => (state.error && codes.includes(state.error) ? errId : undefined);
  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("firstName")} name="firstName" autoComplete="given-name" errorId={on("bad_name")} />
        <Field label={t("lastName")} name="lastName" autoComplete="family-name" errorId={on("bad_name")} />
      </div>
      <Field label={t("email")} name="email" type="email" autoComplete="email" errorId={on("email_taken")} />
      <Field label={t("phone")} name="phone" type="tel" autoComplete="tel" errorId={on("bad_phone")} />
      <Field label={t("password")} name="password" type="password" autoComplete="new-password" minLength={8} errorId={on("weak_password")} />
      <Field label={t("confirm")} name="confirm" type="password" autoComplete="new-password" minLength={8} errorId={on("weak_password")} />
      <FormError id={errId} message={state.error ? t(`errors.${state.error}` as never) : undefined} />
      <Submit pending={pending}>{t("submit")}</Submit>
      <Link href="/login" className="text-sm underline">{t("haveAccount")}</Link>
    </form>
  );
}
