import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { listUsers } from "@/lib/services/users";
import { ListView } from "@/components/list-view";
import { dt, Th } from "@/components/data-table";

export default async function StudentsPage() {
  const [t, tu, actor] = await Promise.all([getTranslations("studentCard"), getTranslations("users"), requireActor()]);
  const list = (await listUsers(db(), actor, { role: "student" })).filter((u) => u.id !== actor.id || actor.roles.includes("student") === false);
  const names = new Map((await listUsers(db(), actor)).map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const coord = (u: (typeof list)[number]) => (u.coordinatorId ? names.get(u.coordinatorId) ?? "" : t("unassigned"));
  return (
    <main className="mx-auto w-full max-w-7xl p-4 lg:p-8">
      <h1 className="text-xl font-semibold">{t("listTitle")} <span className="text-base font-normal text-ink-3">({list.length})</span></h1>
      {list.length === 0 && <p className="mt-3 text-muted">{t("emptyList")}</p>}
      {list.length > 0 && (
        <ListView storageKey="students" placeholder={t("searchPlaceholder")} table={(
          <table className={dt.table}>
            <thead className={dt.head}>
              <tr><Th sort="text">{t("colName")}</Th><Th sort="text" className="hidden sm:table-cell">{t("colEmail")}</Th><Th sort="text">{t("colCoordinator")}</Th><Th sort="text">{t("colStatus")}</Th><th scope="col" className="px-3 py-2"><span className="sr-only">{t("open")}</span></th></tr>
            </thead>
            <tbody className={dt.body}>
              {list.map((u) => (
                <tr key={u.id} data-search={`${u.firstName} ${u.lastName} ${u.email} ${coord(u)} ${tu(`status.${u.status}`)}`} className="hover:bg-paper">
                  <th scope="row" className={`${dt.td} text-start font-medium`}><Link href={`/students/${u.id}`} className="inline-flex min-h-8 items-center text-info-fg hover:underline">{u.firstName} {u.lastName}</Link></th>
                  <td className={`${dt.td} hidden text-ink-2 sm:table-cell`} dir="ltr">{u.email}</td>
                  <td className={`${dt.td} text-ink-2`}>{coord(u)}</td>
                  <td className={dt.td}><span className="rounded-full border border-hairline px-2 py-0.5 text-xs">{tu(`status.${u.status}`)}</span></td>
                  <td className={`${dt.td} text-end`}><Link href={`/students/${u.id}`} aria-hidden="true" tabIndex={-1} className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm hover:bg-paper md:min-h-8 md:px-3">{t("open")}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )} />
      )}
    </main>
  );
}
