import { getTranslations } from "next-intl/server";
import { resendInviteAction, setRolesAction, setStatusAction } from "@/lib/actions/users";
import { roles } from "@/lib/permissions";
import type { SafeUser } from "@/lib/services/users";
import { SubmitButton } from "@/components/submit-button";

export async function UserRow({ user, coordinatorName, self }: { user: SafeUser; coordinatorName: string | null; self: boolean }) {
  const t = await getTranslations("users");
  const tr = await getTranslations("roles");
  return (
    <li className="grid items-center gap-x-4 gap-y-1 py-2.5 md:grid-cols-[minmax(0,1.3fr)_auto_minmax(0,2.2fr)_auto]">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{user.firstName} {user.lastName}</p>
        <p className="truncate text-xs text-muted" dir="ltr">{user.email}</p>
        {user.roles.includes("student") && <p className="truncate text-xs text-muted">{t("coordinator")}: {coordinatorName ?? t("unassigned")}</p>}
      </div>
      <span className="w-fit rounded-full border border-border px-2 py-0.5 text-xs">{t(`status.${user.status}`)}</span>
      <form action={setRolesAction} className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <input type="hidden" name="userId" value={user.id} />
        {roles.map((r) => (
          <label key={r} className="flex items-center gap-1 text-xs">
            <input type="checkbox" name="roles" value={r} defaultChecked={user.roles.includes(r)} /> {tr(r)}
          </label>
        ))}
        <SubmitButton className="text-xs underline">{t("saveRoles")}</SubmitButton>
      </form>
      <div className="flex gap-3 text-xs">
        {user.status !== "active" || !self ? (
          <form action={resendInviteAction}>
            <input type="hidden" name="userId" value={user.id} />
            <SubmitButton className="underline">{user.status === "invited" ? t("resendInvite") : t("sendReset")}</SubmitButton>
          </form>
        ) : null}
        {!self && (
          <form action={setStatusAction}>
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="status" value={user.status === "inactive" ? "active" : "inactive"} />
            <SubmitButton className="underline">{user.status === "inactive" ? t("activate") : t("deactivate")}</SubmitButton>
          </form>
        )}
      </div>
    </li>
  );
}
