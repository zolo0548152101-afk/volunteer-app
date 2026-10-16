import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { listUsers } from "@/lib/services/users";
import { InviteForm } from "@/components/users/invite-form";
import { BulkAssign } from "@/components/users/bulk-assign";
import { UserRow } from "@/components/users/user-row";
import { Flash } from "@/components/flash";

const ERRORS = ["forbidden", "not_found", "email_taken", "bad_roles", "bad_coordinator", "not_student", "last_manager", "self_lockout", "required", "generic"];

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireRole("manager");
  if (!can(actor, "manage", "user", { organizationId: actor.organizationId })) redirect("/");
  const [t, { error }, list] = await Promise.all([getTranslations("users"), searchParams, listUsers(db(), actor)]);
  const coordinators = list.filter((u) => u.roles.includes("coordinator") && u.status !== "inactive");
  const students = list.filter((u) => u.roles.includes("student"));
  const nameOf = new Map(list.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      {error && ERRORS.includes(error) && <Flash tone="error" className="mt-3 rounded-lg border border-bad/50 p-3 text-sm text-bad-fg">{t(`errors.${error}` as never)}</Flash>}

      <section className="mt-6" aria-labelledby="invite-h">
        <h2 id="invite-h" className="text-lg font-medium">{t("inviteTitle")}</h2>
        <InviteForm coordinators={coordinators.map((c) => ({ id: c.id, name: nameOf.get(c.id)! }))} />
      </section>

      <section className="mt-8" aria-labelledby="bulk-h">
        <h2 id="bulk-h" className="text-lg font-medium">{t("bulkTitle")}</h2>
        <BulkAssign
          coordinators={coordinators.map((c) => ({ id: c.id, name: nameOf.get(c.id)! }))}
          students={students.map((s) => ({ id: s.id, name: nameOf.get(s.id)!, coordinator: s.coordinatorId ? nameOf.get(s.coordinatorId) ?? null : null }))}
        />
      </section>

      <section className="mt-8" aria-labelledby="list-h">
        <h2 id="list-h" className="text-lg font-medium">{t("listTitle", { count: list.length })}</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {list.map((u) => (
            <UserRow key={u.id} user={u} coordinatorName={u.coordinatorId ? nameOf.get(u.coordinatorId) ?? null : null} self={u.id === actor.id} />
          ))}
        </ul>
      </section>
    </main>
  );
}
