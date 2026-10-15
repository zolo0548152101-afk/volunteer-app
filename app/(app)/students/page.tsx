import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { listUsers } from "@/lib/services/users";

export default async function StudentsPage() {
  const [t, actor] = await Promise.all([getTranslations("studentCard"), requireActor()]);
  const list = (await listUsers(db(), actor, { role: "student" })).filter((u) => u.id !== actor.id || actor.roles.includes("student") === false);
  const names = new Map((await listUsers(db(), actor)).map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <h1 className="text-xl font-semibold">{t("listTitle")}</h1>
      {list.length === 0 && <p className="mt-3 text-muted">{t("emptyList")}</p>}
      <ul className="mt-3 flex flex-col gap-2">
        {list.map((u) => (
          <li key={u.id} className="rounded-xl border border-border p-3">
            <Link href={`/students/${u.id}`} className="font-medium underline">{u.firstName} {u.lastName}</Link>
            <p className="text-sm text-muted">{u.coordinatorId ? names.get(u.coordinatorId) ?? "" : t("unassigned")}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
