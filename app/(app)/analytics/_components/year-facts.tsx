import { getTranslations } from "next-intl/server";
import type { DashboardData } from "@/lib/services/analytics";
import { card, CardTitle } from "./ui";

export async function YearFacts({ yearName, year }: { yearName: string; year: DashboardData["year"] }) {
  const t = await getTranslations("dashboard.year");
  const rows: [string, string][] = [
    [t("academicYear"), yearName || t("noYear")],
    [t("weeksLeft"), String(Math.round(year.weeksRemaining))],
    ...(year.milestone1 ? [[t("milestone1"), `${year.milestone1.reached} / ${year.milestone1.total}`] as [string, string]] : []),
    [t("absences"), String(year.approvedAbsences)],
    [t("places"), String(year.activePlaces)],
  ];
  return (
    <section className={card} aria-labelledby="h-year">
      <CardTitle id="h-year">{t("title")}</CardTitle>
      <dl className="flex flex-col">
        {rows.map(([k, v]) => (
          <div key={k} className="flex min-h-11 items-center justify-between gap-3 border-t border-hairline text-[13px]"><dt className="text-ink-2">{k}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}
