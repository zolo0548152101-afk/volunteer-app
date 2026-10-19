"use client";
import { useActionState, useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { inviteUserAction, type UserActionState } from "@/lib/actions/users";
import { roles } from "@/lib/permissions";
import { Field, FormError, Submit } from "@/components/auth/fields";
import { MultiSelect } from "@/components/multi-select";

export function InviteForm({ coordinators }: { coordinators: { id: string; name: string }[] }) {
  const t = useTranslations("users");
  const tr = useTranslations("roles");
  const [state, action, pending] = useActionState<UserActionState, FormData>(inviteUserAction, {});
  const errId = useId();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) form.current?.dispatchEvent(new Event("dialogdone", { bubbles: true })); }, [state]);
  return (
    <form ref={form} action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("firstName")} name="firstName" />
        <Field label={t("lastName")} name="lastName" />
        <Field label={t("email")} name="email" type="email" autoComplete="off" errorId={state.error === "email_taken" ? errId : undefined} />
        <label className="flex flex-col gap-1 text-sm">
          {t("phone")}
          <input name="phone" type="tel" dir="ltr" className="rounded-lg border border-border bg-transparent px-3 py-2 text-base" />
        </label>
      </div>
      <MultiSelect name="roles" label={t("roles")} options={roles.map((r) => ({ value: r, label: tr(r) }))} defaultValue={["student"]} />
      <label className="flex flex-col gap-1 text-sm">
        {t("coordinator")}
        <select name="coordinatorId" defaultValue="" className="rounded-lg border border-border bg-transparent px-3 py-2 text-base">
          <option value="">{t("noCoordinator")}</option>
          {coordinators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <FormError id={errId} message={state.error ? t(`errors.${state.error}` as never) : undefined} />
      <Submit pending={pending}>{t("invite")}</Submit>
    </form>
  );
}
