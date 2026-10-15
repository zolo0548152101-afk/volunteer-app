"use client";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { assignCoordinatorAction, type UserActionState } from "@/lib/actions/users";
import { FormError, Submit } from "@/components/auth/fields";

export function BulkAssign({ coordinators, students }: {
  coordinators: { id: string; name: string }[];
  students: { id: string; name: string; coordinator: string | null }[];
}) {
  const t = useTranslations("users");
  const [state, action, pending] = useActionState<UserActionState, FormData>(assignCoordinatorAction, {});
  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <fieldset className="max-h-60 overflow-auto rounded-lg border border-border p-3">
        <legend className="px-1 text-sm">{t("pickStudents")}</legend>
        {students.length === 0 && <p className="text-sm text-muted">{t("noStudents")}</p>}
        {students.map((s) => (
          <label key={s.id} className="flex items-center gap-2 py-1 text-sm">
            <input type="checkbox" name="studentIds" value={s.id} />
            <span>{s.name}</span>
            <span className="text-muted">{s.coordinator ?? t("unassigned")}</span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        {t("coordinator")}
        <select name="coordinatorId" defaultValue="" className="rounded-lg border border-border bg-transparent px-3 py-2 text-base">
          <option value="">{t("noCoordinator")}</option>
          {coordinators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <FormError message={state.error ? t(`errors.${state.error}` as never) : undefined} />
      {state.ok && <p role="status" className="text-sm text-green-700">{t("assigned")}</p>}
      <Submit pending={pending}>{t("assign")}</Submit>
    </form>
  );
}
