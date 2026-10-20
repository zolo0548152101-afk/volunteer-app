import { and, asc, eq, like } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { devLoginAction } from "@/lib/actions/auth";
import { db } from "@/lib/db";
import { DEMO_DOMAIN, DEMO_ORG_NAME, devLoginEnabled } from "@/lib/dev-login";
import { organizations, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const ORDER = ["manager", "coordinator", "interviewer", "student"] as const;

/** בחירת משתמש הדגמה לכניסה בלי סיסמה. קיימת רק בסביבות פיתוח/Preview (lib/dev-login.ts); בייצור 404 */
export default async function DevLoginPage() {
  if (!devLoginEnabled()) notFound();
  const t = await getTranslations("devLogin");
  const tR = await getTranslations("roles");
  const [org] = await db().select({ id: organizations.id }).from(organizations).where(eq(organizations.name, DEMO_ORG_NAME)).orderBy(asc(organizations.createdAt)).limit(1);
  const list = org
    ? await db().select({ id: users.id, first: users.firstName, last: users.lastName, roles: users.roles })
        .from(users).where(and(eq(users.organizationId, org.id), eq(users.status, "active"), like(users.email, `%${DEMO_DOMAIN}`)))
        .orderBy(asc(users.lastName), asc(users.firstName))
    : [];
  const primary = (r: string[]) => ORDER.find((x) => r.includes(x)) ?? "student";
  const groups = ORDER.map((role) => ({ role, items: list.filter((u) => primary(u.roles) === role) })).filter((g) => g.items.length > 0);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 p-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("hint")}</p>
      </header>
      {groups.length === 0 && <p>{t("empty")}</p>}
      {groups.map((g) => (
        <section key={g.role} aria-labelledby={`g-${g.role}`} className="flex flex-col gap-2">
          <h2 id={`g-${g.role}`} className="text-sm font-medium text-muted">{tR(g.role)}</h2>
          {g.items.map((u) => (
            <form key={u.id} action={devLoginAction}>
              <input type="hidden" name="userId" value={u.id} />
              <button type="submit" className="flex min-h-11 w-full items-center justify-between rounded-lg border border-border px-4 py-2 text-start hover:bg-paper">
                <span>{u.first} {u.last}</span>
                <span className="text-sm text-muted">{t("enter")}</span>
              </button>
            </form>
          ))}
        </section>
      ))}
      <a href="/login?password=1" className="inline-flex min-h-11 items-center self-start text-sm underline">{t("passwordLogin")}</a>
    </main>
  );
}
