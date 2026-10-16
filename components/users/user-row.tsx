import { getTranslations } from "next-intl/server";
import { resendInviteAction, setRolesAction, setStatusAction } from "@/lib/actions/users";
import { roles } from "@/lib/permissions";
import type { SafeUser } from "@/lib/services/users";
import { SubmitButton } from "@/components/submit-button";

export async function UserRow({ user, coordinatorName, self }: { user: SafeUser; coordinatorName: string | null; self: boolean }) {
  const t = await getTranslations("users");
  const tr = await getTranslations("roles");
  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-medium">{user.firstName} {user.lastName}</p>
          <p className="text-sm text-muted" dir="ltr">{user.email}</p>
        </div>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs">{t(`status.${user.status}`)}</span>
      </div>
      {user.roles.includes("student") && (
        <p className="mt-1 text-sm text-muted">{t("coordinator")}: {coordinatorName ?? t("unassigned")}</p>
      )}
      <form action={setRolesAction} className="mt-2 flex flex-wrap items-center gap-3">
        <input type="hidden" name="userId" value={user.id} />
        {roles.map((r) => (
          <label key={r} className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="roles" value={r} defaultChecked={user.roles.includes(r)} /> {tr(r)}
          </label>
        ))}
        <SubmitButton className="text-sm underline">{t("saveRoles")}</SubmitButton>
      </form>
      <div className="mt-2 flex gap-4 text-sm">
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
