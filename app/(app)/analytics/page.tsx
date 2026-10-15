import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BarChart } from "@/components/bar-chart";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { dashboard, REPORT_KINDS } from "@/lib/services/analytics";

export default async function Analytics() {
  const [t, actor] = await Promise.all([getTranslations("analytics"), requireActor()]);
  let d;
  try { d = await dashboard(db(), actor); } catch (e) { if (e instanceof ForbiddenError) redirect("/"); throw e; }
  const isManager = actor.roles.includes("manager");
  const kinds = REPORT_KINDS.filter((k) => isManager || k !== "coordinators");
  const stat = (label: string, value: string | number, href?: string) => (
    <div className="rounded-xl border border-border p-3"><dt className="text-sm text-muted">{label}</dt><dd className="text-2xl font-semibold">{href ? <Link href={href} className="underline">{value}</Link> : value}</dd></div>
  );
  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <h1 className="text-xl font-semibold">{t("dashboardTitle")}</h1>
      {d.yearName && <p className="text-sm text-muted">{t("year", { name: d.yearName })}</p>}
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat(t("activeStudents"), d.activeStudents, "/students")}
        {stat(t("awaitingInterview"), d.awaitingInterview)}
        {stat(t("staleReports", { days: d.escalationDays }), d.staleReports, "/reports")}
        {stat(t("pendingReports"), d.pendingReports, "/reports")}
      </dl>
      <p className="mt-4 text-sm">{t("slotsLine", { used: d.slots.used, total: d.slots.total, percent: d.slots.percent })}</p>
      <div className="mt-1 h-3 w-full max-w-md overflow-hidden rounded-full bg-muted/30" role="progressbar" aria-valuenow={d.slots.percent} aria-valuemin={0} aria-valuemax={100} aria-label={t("slotsLabel")}>
        <div className="h-full bg-primary" style={{ width: `${Math.min(100, d.slots.percent)}%` }} />
      </div>

      <h2 className="mt-8 text-lg font-medium">{t("byMonth")}</h2>
      {d.byMonth.length === 0 ? <p className="text-muted">{t("noData")}</p> : <>
        <BarChart data={d.byMonth} unit={t("hoursUnit")} />
        <table className="mt-2 w-full max-w-md text-sm"><caption className="sr-only">{t("byMonth")}</caption><tbody>{d.byMonth.map((m) => <tr key={m.label}><th scope="row" className="text-start font-normal">{m.label}</th><td>{m.value}</td></tr>)}</tbody></table>
      </>}

      <h2 className="mt-8 text-lg font-medium">{t("byPlace")}</h2>
      {d.byPlace.length === 0 ? <p className="text-muted">{t("noData")}</p> : <>
        <BarChart data={d.byPlace} unit={t("hoursUnit")} />
        <table className="mt-2 w-full max-w-md text-sm"><caption className="sr-only">{t("byPlace")}</caption><tbody>{d.byPlace.map((m) => <tr key={m.label}><th scope="row" className="text-start font-normal">{m.label}</th><td>{m.value}</td></tr>)}</tbody></table>
      </>}

      <h2 className="mt-8 text-lg font-medium">{t("reportsTitle")}</h2>
      <ul className="mt-2 flex flex-col gap-1">
        {kinds.map((k) => <li key={k}><Link href={`/analytics/${k}`} className="underline">{t(`kinds.${k}`)}</Link></li>)}
      </ul>
    </main>
  );
}
