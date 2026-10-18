import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { dashboard, REPORT_KINDS } from "@/lib/services/analytics";
import { KpiCard } from "./_components/kpi-card";
import { MonthChart } from "./_components/month-chart";
import { CoordinatorLoad } from "./_components/coordinator-load";
import { OldestPending } from "./_components/oldest-pending";
import { PlaceOccupancy } from "./_components/place-occupancy";
import { YearFacts } from "./_components/year-facts";

/** שעת היום לפי שעון ישראל, לברכה בלבד */
function daypart(): "morning" | "afternoon" | "evening" {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jerusalem" }).slice(0, 2));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

const icon = (d: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={d} /></svg>;
const ICONS = {
  students: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0",
  awaiting: "M8 7h8M8 12h8M8 17h5M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
  pending: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2",
  hours: "M20 6 9 17l-5-5",
  slots: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
};

export default async function Analytics() {
  const [t, ta, actor, format] = await Promise.all([getTranslations("dashboard"), getTranslations("analytics"), requireActor(), getFormatter()]);
  let d;
  try { d = await dashboard(db(), actor); } catch (e) { if (e instanceof ForbiddenError) redirect("/"); throw e; }
  const isManager = actor.roles.includes("manager");
  const kinds = REPORT_KINDS.filter((k) => isManager || k !== "coordinators");
  const firstName = (actor.name ?? "").split(" ")[0];
  const stale = d.staleReports;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6">
      {/* כותרת: ברכה + משפט מצב אחד + פעולה ראשית אחת */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-80">
          <h1 className="text-xl font-bold">{t(`greeting.${daypart()}`, { name: firstName })}</h1>
          <p className="mt-1 text-sm text-ink-2">{isManager ? t("statusLineManager", { awaiting: d.awaitingInterview, percent: Math.round(d.slots.percent) }) : t("statusLine", { pending: d.pendingReports, stale, days: d.escalationDays, awaiting: d.awaitingInterview, percent: Math.round(d.slots.percent) })}</p>
          {d.yearName && <p className="mt-1 text-xs text-ink-3">{ta("year", { name: d.yearName })}</p>}
        </div>
        {!isManager && (
          <Link href="/reports?status=pending" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90">
          {t("toInbox")}<span aria-hidden="true" className="rtl:rotate-180">→</span>
          </Link>
        )}
      </div>

      {/* פס המדדים */}
      <section aria-label={ta("dashboardTitle")} className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!isManager && (<KpiCard href="/reports?status=pending" label={t("kpi.pending")} value={d.pendingReports} note={t("kpi.stale", { n: stale, days: d.escalationDays })} tone={stale > 0 ? "warn" : "neutral"} icon={icon(ICONS.pending)} />)}
        <KpiCard href={isManager ? "/interviewer" : undefined} label={t("kpi.awaiting")} value={d.awaitingInterview} note={t("kpi.awaitingWeek", { n: d.awaitingThisWeek })} tone={d.awaitingInterview > 0 ? "info" : "neutral"} icon={icon(ICONS.awaiting)} />
        <KpiCard href="/analytics/months" label={t("kpi.hoursYear")} value={format.number(d.hoursYear)} note={t("kpi.hours30", { n: format.number(d.hoursLast30Days) })} tone={d.hoursLast30Days > 0 ? "ok" : "neutral"} icon={icon(ICONS.hours)} />
        {isManager && <KpiCard href="/places" label={t("kpi.occupancy")} value={`${Math.round(d.slots.percent)}%`} note={t("kpi.occupancyOf", { used: d.slots.used, total: d.slots.total })} icon={icon(ICONS.slots)} />}
        <KpiCard href="/students" label={t("kpi.activeStudents")} value={d.activeStudents} note={t("kpi.newThisMonth", { n: d.newStudentsThisMonth })} tone={d.newStudentsThisMonth > 0 ? "ok" : "neutral"} icon={icon(ICONS.students)} />
      </section>

      {isManager ? (
        <>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <PlaceOccupancy rows={d.placeOccupancy} />
            <CoordinatorLoad rows={d.coordinators} escalationDays={d.escalationDays} manager />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <MonthChart data={d.byMonth} />
            <YearFacts yearName={d.yearName} year={d.year} />
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <OldestPending rows={d.oldestPending} escalationDays={d.escalationDays} />
            <YearFacts yearName={d.yearName} year={d.year} />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <PlaceOccupancy rows={d.placeOccupancy} />
            <MonthChart data={d.byMonth} />
            <section className="rounded-xl border border-hairline bg-card p-4" aria-labelledby="h-reports">
              <h2 id="h-reports" className="text-sm font-semibold">{t("reports")}</h2>
              <ul className="mt-1 flex flex-col">{kinds.map((k) => <li key={k}><Link href={`/analytics/${k}`} className="inline-flex min-h-10 items-center text-sm hover:underline">{ta(`kinds.${k}`)}</Link></li>)}</ul>
            </section>
          </div>
        </>
      )}

      {isManager && (
        <nav aria-label={t("reports")} className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span className="font-semibold">{t("reports")}:</span>
          {kinds.map((k) => <Link key={k} href={`/analytics/${k}`} className="inline-flex min-h-11 items-center hover:underline">{ta(`kinds.${k}`)}</Link>)}
        </nav>
      )}

      <p className="mt-4 text-xs text-ink-3">{t("provenance", { at: format.dateTime(new Date(), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jerusalem" }) })}</p>
    </main>
  );
}
