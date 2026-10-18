import { getTranslations } from "next-intl/server";
import { resendInviteAction, setRolesAction, setStatusAction } from "@/lib/actions/users";
import { roles } from "@/lib/permissions";
import type { SafeUser } from "@/lib/services/users";
import { SubmitButton } from "@/components/submit-button";
import { EditDialog } from "@/components/edit-dialog";
import { MultiSelect } from "@/components/multi-select";
import { BulkAssign } from "@/components/users/bulk-assign";

type Person = { id: string; name: string };
const chip = { active: "bg-ok-bg text-ok-fg", invited: "bg-warn-bg text-warn-fg", inactive: "bg-paper text-ink-3" } as const;

/** שורת משתמש בטבלה: תקציר, ו"עריכה" שפותחת חלון עם תפקידים, שיוך לרכז, הזמנה מחדש והשבתה */
export async function UserRow({ user, coordinatorName, self, coordinators }: { user: SafeUser; coordinatorName: string | null; self: boolean; coordinators: Person[] }) {
  const t = await getTranslations("users");
  const tr = await getTranslations("roles");
  const isStudent = user.roles.includes("student");
  const name = `${user.firstName} ${user.lastName}`;
  return (
    <tr data-search={`${name} ${user.email} ${user.roles.map((r) => tr(r)).join(" ")} ${coordinatorName ?? ""}`}>
      <th scope="row" className="px-3 py-2.5 text-start font-medium">
        <span className="block">{name}</span>
        <span className="block text-xs font-normal text-ink-3" dir="ltr">{user.email}</span>
      </th>
      <td className="px-3 py-2.5"><span className="flex flex-wrap gap-1">{user.roles.map((r) => <span key={r} className="rounded-full bg-info-bg px-2 py-0.5 text-xs text-info-fg">{tr(r)}</span>)}</span></td>
      <td className="hidden px-3 py-2.5 sm:table-cell"><span className={`rounded-full px-2 py-0.5 text-xs ${chip[user.status]}`}>{t(`status.${user.status}`)}</span></td>
      <td className="hidden px-3 py-2.5 sm:table-cell">{isStudent ? (coordinatorName ?? <span className="text-ink-3">{t("unassigned")}</span>) : "—"}</td>
      <td className="px-3 py-2.5 text-end">
        <EditDialog label={t("editRow")} title={name}>
          <div className="flex flex-col gap-5">
            <form action={setRolesAction} className="flex flex-col gap-3">
              <input type="hidden" name="userId" value={user.id} />
              <MultiSelect name="roles" label={t("roles")} options={roles.map((r) => ({ value: r, label: tr(r) }))} defaultValue={user.roles} />
              <SubmitButton className="min-h-10 self-start rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground">{t("saveRoles")}</SubmitButton>
            </form>
            {isStudent && (
              <section className="border-t border-hairline pt-4" aria-label={t("bulkTitle")}>
                <h3 className="mb-2 text-sm font-semibold">{t("coordinator")}</h3>
                <BulkAssign coordinators={coordinators} students={[{ id: user.id, name, coordinator: coordinatorName }]} defaultStudentIds={[user.id]} defaultCoordinatorId={user.coordinatorId ?? ""} />
              </section>
            )}
            <div className="flex flex-wrap gap-2 border-t border-hairline pt-4">
              {(user.status !== "active" || !self) && (
                <form action={resendInviteAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <SubmitButton className="min-h-10 rounded-lg border border-border px-4 text-sm hover:bg-paper">{user.status === "invited" ? t("resendInvite") : t("sendReset")}</SubmitButton>
                </form>
              )}
              {!self && (
                <form action={setStatusAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="status" value={user.status === "inactive" ? "active" : "inactive"} />
                  <SubmitButton className={`min-h-10 rounded-lg border px-4 text-sm ${user.status === "inactive" ? "border-border hover:bg-paper" : "border-bad/50 text-bad-fg hover:bg-bad-bg"}`}>{user.status === "inactive" ? t("activate") : t("deactivate")}</SubmitButton>
                </form>
              )}
            </div>
          </div>
        </EditDialog>
      </td>
    </tr>
  );
}
