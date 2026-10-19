import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { listUsers } from "@/lib/services/users";
import { InviteForm } from "@/components/users/invite-form";
import { BulkAssign } from "@/components/users/bulk-assign";
import { UserRow } from "@/components/users/user-row";
import { EditDialog } from "@/components/edit-dialog";
import { ListView } from "@/components/list-view";
import { dt, Th } from "@/components/data-table";
import { Flash } from "@/components/flash";

const ERRORS = ["forbidden", "not_found", "email_taken", "bad_roles", "bad_coordinator", "not_student", "last_manager", "self_lockout", "required", "email_failed", "generic"];

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireRole("manager");
  if (!can(actor, "manage", "user", { organizationId: actor.organizationId })) redirect("/");
  const [t, { error }, list] = await Promise.all([getTranslations("users"), searchParams, listUsers(db(), actor)]);
  const coordinators = list.filter((u) => u.roles.includes("coordinator") && u.status !== "inactive");
  const students = list.filter((u) => u.roles.includes("student"));
  const nameOf = new Map(list.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  const people = coordinators.map((c) => ({ id: c.id, name: nameOf.get(c.id)! }));
  const primary = "inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground";
  const secondary = "inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm hover:bg-paper";
  return (
    <main className="mx-auto w-full max-w-7xl p-4 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("title")} <span className="text-base font-normal text-ink-3">({list.length})</span></h1>
        <div className="flex flex-wrap gap-2">
          <EditDialog label={`＋ ${t("inviteTitle")}`} title={t("inviteTitle")} className={primary} closeOnSubmit={false}>
            <InviteForm coordinators={people} />
          </EditDialog>
          <EditDialog label={t("bulkTitle")} title={t("bulkTitle")} className={secondary} closeOnSubmit={false}>
            <BulkAssign coordinators={people} students={students.map((s) => ({ id: s.id, name: nameOf.get(s.id)!, coordinator: s.coordinatorId ? nameOf.get(s.coordinatorId) ?? null : null }))} />
          </EditDialog>
        </div>
      </div>
      {error && ERRORS.includes(error) && <Flash tone="error" className="mt-3 rounded-lg border border-bad/50 p-3 text-sm text-bad-fg">{t(`errors.${error}` as never)}</Flash>}

      <ListView storageKey="users" placeholder={t("searchPlaceholder")} table={(
        <table className={dt.table}>
          <thead className={dt.head}><tr>
            <Th sort="text">{t("user")}</Th><Th>{t("roles")}</Th><Th sort="text" className="hidden sm:table-cell">{t("statusCol")}</Th><Th sort="text" className="hidden sm:table-cell">{t("coordinator")}</Th>
            <th scope="col" className="px-3 py-2"><span className="sr-only">{t("editRow")}</span></th>
          </tr></thead>
          <tbody className={dt.body}>
            {list.map((u) => <UserRow key={u.id} user={u} coordinatorName={u.coordinatorId ? nameOf.get(u.coordinatorId) ?? null : null} self={u.id === actor.id} coordinators={people} />)}
          </tbody>
        </table>
      )} />
    </main>
  );
}
