import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { getMyProfile } from "@/lib/services/students";
import { studentHome } from "@/lib/services/reports";

const link = "inline-flex min-h-11 items-center underline";

export default async function Page() {
  const [t, th, td, format, actor] = await Promise.all([getTranslations(), getTranslations("studentHome"), getTranslations("days"), getFormatter(), requireRole("student")]);
  const p = await getMyProfile(db(), actor);
  if (!p.profileCompletedAt) redirect("/student/setup/1");
  const h = await studentHome(db(), actor);
  const pct = (n: number) => (h.target ? Math.min(100, Math.round((n / h.target) * 100)) : 0);
  const left = h.next ? Math.round((h.next.hours - h.approved) * 100) / 100 : 0;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-5 p-4">
      <header>
        <h1 className="text-xl font-semibold">{actor.name}</h1>
        <p className="mt-1 text-muted">{p.coordinatorName ? t("student.withCoordinator", { name: p.coordinatorName }) : t("student.waiting")}</p>
      </header>

      <Link href="/student/report" className="flex min-h-16 flex-col items-center justify-center rounded-2xl bg-primary px-4 py-3 text-primary-foreground">
        <span className="text-lg font-semibold">{th("reportCta")}</span>
        <span className="text-sm">{th("reportCtaHint")}</span>
      </Link>

      <section aria-labelledby="progress-h" className="rounded-2xl border border-border p-4">
        <h2 id="progress-h" className="font-medium">{th("progressTitle")}</h2>
        <p className="mt-1 text-sm">{h.target ? th("ofTarget", { approved: h.approved, target: h.target }) : th("noTarget", { approved: h.approved })}</p>
        {h.target ? (
          <div
            role="progressbar" aria-valuemin={0} aria-valuemax={h.target} aria-valuenow={Math.min(h.approved, h.target)}
            aria-label={th("progressLabel", { approved: h.approved, target: h.target, pending: h.pending })}
            className="relative mt-3 h-3 overflow-hidden rounded-full bg-border"
          >
            <div className="absolute inset-y-0 start-0 bg-primary/35" style={{ width: `${pct(h.approved + h.pending)}%` }} />
            <div className="absolute inset-y-0 start-0 bg-primary" style={{ width: `${pct(h.approved)}%` }} />
            {h.milestones.filter((m) => m.hours < h.target!).map((m) => (
              <span key={m.hours} aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-background" style={{ insetInlineStart: `${pct(m.hours)}%` }} />
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-sm text-muted">{th("pending", { n: h.pending })}</p>
        {h.milestones.length > 0 && (
          <p className="mt-1 text-sm">{h.next ? th("nextMilestone", { label: h.next.label, hours: h.next.hours, left }) : th("allMilestones")}</p>
        )}
      </section>

      <section aria-labelledby="contract-h" className="rounded-2xl border border-border p-4">
        <h2 id="contract-h" className="font-medium">{th("contractTitle")}</h2>
        {h.contract.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{th("noContract")}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-3">
            {h.contract.map((c) => (
              <li key={c.id} className="text-sm">
                <div className="font-medium">{c.placeName} · {c.windowLabel}</div>
                <div className="text-muted">
                  {c.days.map((d) => td(d)).join(", ")}
                  {c.assignedHours ? <> · <span dir="ltr">{c.assignedHours}</span></> : null}
                  {" · "}{th("contractWeekly", { n: c.weeklyHours })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-h" className="rounded-2xl border border-border p-4">
        <h2 id="recent-h" className="font-medium">{th("recentTitle")}</h2>
        {h.recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{th("recentEmpty")}</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {h.recent.map((r) => (
              <li key={r.id}>
                <Link href={`/student/reports/${r.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 py-2 text-sm">
                  <span>{format.dateTime(new Date(`${r.volunteerDate}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}{r.reportType === "absence" ? ` · ${th("absenceTag")}` : r.placeName ? ` · ${r.placeName}` : ""}</span>
                  <span className="text-muted">{t("myReports.hours", { n: r.reportedHours })} · {t(`myReports.status.${r.status}`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/student/reports" className={`${link} mt-1 text-sm`}>{th("allReports")}</Link>
      </section>

      <nav className="flex flex-wrap gap-x-6 text-sm">
        <Link href={`/certificate/${actor.id}`} className={link}>{t("nav4.certificate")}</Link>
        <Link href="/student/profile" className={link}>{t("nav.profile")}</Link>
        <Link href="/places" className={link}>{t("nav.places")}</Link>
      </nav>
    </main>
  );
}
