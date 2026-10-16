"use client";
import { useActionState, useId } from "react";
import { useTranslations } from "next-intl";
import { loginAction, type FormState } from "@/lib/actions/auth";
import { Field, FormError, Submit } from "./fields";

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  const errId = useId(), err = state.error ? errId : undefined;
  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label={t("email")} name="email" type="email" autoComplete="email" errorId={err} />
      <Field label={t("password")} name="password" type="password" autoComplete="current-password" errorId={err} />
      <FormError id={errId} message={state.error ? t(`errors.${state.error}`) : undefined} />
      <Submit pending={pending}>{t("submit")}</Submit>
    </form>
  );
}
