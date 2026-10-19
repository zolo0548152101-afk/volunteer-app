"use client";
import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { assignCoordinatorAction, type UserActionState } from "@/lib/actions/users";
import { FormError, Submit } from "@/components/auth/fields";
import { MultiSelect } from "@/components/multi-select";

/** שיוך סטודנטים לרכז: שדה בחירה מרובה (עם חיפוש) + רכז. אפשר לפתוח אותו עם סטודנט וברירת מחדל ממולאים */
export function BulkAssign({ coordinators, students, defaultStudentIds = [], defaultCoordinatorId = "" }: {
  coordinators: { id: string; name: string }[];
  students: { id: string; name: string; coordinator: string | null }[];
  defaultStudentIds?: string[];
  defaultCoordinatorId?: string;
}) {
  const t = useTranslations("users");
  const [state, action, pending] = useActionState<UserActionState, FormData>(assignCoordinatorAction, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) form.current?.dispatchEvent(new Event("dialogdone", { bubbles: true })); }, [state]);
  return (
    <form ref={form} action={action} className="flex flex-col gap-3">
      {students.length === 0
        ? <p className="text-sm text-ink-3">{t("noStudents")}</p>
        : <MultiSelect name="studentIds" label={t("pickStudents")} searchable options={students.map((s) => ({ value: s.id, label: s.name, hint: s.coordinator ?? t("unassigned") }))} defaultValue={defaultStudentIds} />}
      <label className="flex flex-col gap-1 text-sm">
        {t("coordinator")}
        <select name="coordinatorId" defaultValue={defaultCoordinatorId} className="rounded-lg border border-border bg-transparent px-3 py-2 text-base">
          <option value="">{t("noCoordinator")}</option>
          {coordinators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <FormError message={state.error ? t(`errors.${state.error}` as never) : undefined} />
      <Submit pending={pending}>{t("assign")}</Submit>
    </form>
  );
}
