import { getTranslations } from "next-intl/server";
import type { DashboardData } from "@/lib/services/analytics";
import { ageTone, Avatar, card, CardTitle, Pill } from "./ui";

export async function CoordinatorLoad({ rows, escalationDays, manager = false }: { rows: DashboardData["coordinators"]; escalationDays: number; manager?: boolean }) {
  const t = await getTranslations("dashboard.coordinators");
  return (
    <section className={`${card} flex flex-col gap-3`} aria-labelledby="h-coord">
      <CardTitle id="h-coord">{t("title")}</CardTitle>
      {rows.length === 0 ? <p className="text-sm text-ink-3">{t("empty")}</p> : (
        <ul className="flex flex-col gap-2">
          {rows.map((c) => (
            <li key={c.id} className="flex min-h-[60px] items-center gap-3 rounded-xl border border-hairline bg-paper px-3">
              <Avatar id={c.id} name={c.name} />
              <span className="flex min-w-0 flex-1 flex-col"><span className="text-sm font-semibold">{c.name}</span><span className="text-xs text-ink-3">{manager ? t("lineManager", { students: c.students }) : t("line", { students: c.students, pending: c.pending })}</span></span>
              {!manager && <Pill tone={ageTone(c.oldestDays, escalationDays)}>{c.oldestDays === null ? t("noQueue") : t("oldest", { n: c.oldestDays })}</Pill>}
            </li>
          ))}
        </ul>
      )}
      {!manager && <p className="text-xs text-ink-3">{t("hint")}</p>}
    </section>
  );
}
