import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { listUsers } from "@/lib/services/users";

export default async function StudentsPage() {
  const [t, tu, actor] = await Promise.all([getTranslations("studentCard"), getTranslations("users"), requireActor()]);
  const list = (await listUsers(db(), actor, { role: "student" })).filter((u) => u.id !== actor.id || actor.roles.includes("student") === false);
  const names = new Map((await listUsers(db(), actor)).map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  return (
    <main className="mx-auto w-full max-w-5xl p-4">
      <h1 className="text-xl font-semibold">{t("listTitle")}</h1>
      {list.length === 0 && <p className="mt-3 text-muted">{t("emptyList")}</p>}
      {list.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-hairline bg-card">
          <table className="w-full text-sm">
            <thead className="bg-paper text-start text-xs text-ink-3">
              <tr><th scope="col" className="px-4 py-2 text-start font-medium">{t("colName")}</th><th scope="col" className="hidden px-4 py-2 text-start font-medium sm:table-cell">{t("colEmail")}</th><th scope="col" className="px-4 py-2 text-start font-medium">{t("colCoordinator")}</th><th scope="col" className="px-4 py-2 text-start font-medium">{t("colStatus")}</th></tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {list.map((u) => (
                <tr key={u.id} className="hover:bg-paper">
                  <td className="px-4 py-2.5"><Link href={`/students/${u.id}`} className="inline-flex min-h-8 items-center font-medium text-info-fg hover:underline">{u.firstName} {u.lastName}</Link></td>
                  <td className="hidden px-4 py-2.5 text-ink-2 sm:table-cell" dir="ltr">{u.email}</td>
                  <td className="px-4 py-2.5 text-ink-2">{u.coordinatorId ? names.get(u.coordinatorId) ?? "" : t("unassigned")}</td>
                  <td className="px-4 py-2.5"><span className="rounded-full border border-hairline px-2 py-0.5 text-xs">{tu(`status.${u.status}`)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
