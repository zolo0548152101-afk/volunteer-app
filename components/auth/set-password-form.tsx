"use client";
import Link from "next/link";
import { useActionState, useId } from "react";
import { useTranslations } from "next-intl";
import { setPasswordAction, type FormState } from "@/lib/actions/auth";
import { Field, FormError, Submit } from "./fields";

export function SetPasswordForm({ token, kind }: { token: string; kind: "invite" | "password_reset" }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<FormState, FormData>(setPasswordAction, {});
  const errId = useId(), err = state.error ? errId : undefined;
  if (state.done)
    return (
      <p className="mt-4" role="status">
        {t("passwordSet")} <Link href="/login" className="underline">{t("submit")}</Link>
      </p>
    );
  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="kind" value={kind} />
      <Field label={t("newPassword")} name="password" type="password" autoComplete="new-password" minLength={8} errorId={err} />
      <Field label={t("confirmPassword")} name="confirm" type="password" autoComplete="new-password" minLength={8} errorId={err} />
      <FormError id={errId} message={state.error ? t(`errors.${state.error}`) : undefined} />
      <Submit pending={pending}>{t("savePassword")}</Submit>
    </form>
  );
}
