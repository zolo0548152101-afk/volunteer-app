"use client";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { requestResetAction, type FormState } from "@/lib/actions/auth";
import { Field, FormError, Submit } from "./fields";

export function ForgotForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<FormState, FormData>(requestResetAction, {});
  if (state.done) return <p className="mt-4" role="status">{t("resetSent")}</p>;
  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <Field label={t("email")} name="email" type="email" autoComplete="email" />
      <FormError message={state.error ? t(`errors.${state.error}`) : undefined} />
      <Submit pending={pending}>{t("sendReset")}</Submit>
    </form>
  );
}
