import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { formatDay, formatInstant } from "@/lib/date-format";
import { dt, Th } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { hoursCertificate } from "@/lib/services/analytics";

/** תעודת שעות להדפסה / שמירה כ-PDF מהדפדפן. הסטודנט את שלו; רכז את הסטודנטים שלו; מנהל כולם */
export default async function Certificate({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, t, tn, tc, actor, format] = await Promise.all([params, getTranslations("certificate"), getTranslations("nav"), getTranslations("studentCard"), requireActor(), getFormatter()]);
  let c;
  try { c = await hoursCertificate(db(), actor, id); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  if (!c) notFound();
  return (
    <main className="mx-auto w-full max-w-2xl p-6 print:p-0">
      <PageHeader crumbs={actor.roles.includes("student") && actor.roles.length === 1 ? [{ label: tn("home"), href: "/student" }] : [{ label: tc("listTitle"), href: "/students" }, { label: c.student, href: `/students/${id}` }]} current={t("title")} />
      <div className="flex items-start justify-between"><h1 className="text-2xl font-semibold">{t("title")}</h1><PrintButton label={t("print")} /></div>
      <p className="mt-4 text-lg">{c.student}</p>
      <p className="text-sm text-muted">{t("year", { name: c.yearName })}{c.track ? ` · ${c.track}` : ""}</p>
      <p className="mt-4">{t("summary", { total: c.total })}{c.target !== null ? ` ${t("ofTarget", { target: c.target })}` : ""}</p>
      {c.items.length === 0 ? <p className="mt-4 text-muted">{t("none")}</p> : (
        <table className={`mt-4 ${dt.table}`}>
          <thead className={dt.head}><tr><Th>{t("date")}</Th><Th>{t("place")}</Th><Th num>{t("hours")}</Th></tr></thead>
          <tbody className={dt.body}>{c.items.map((x, i) => <tr key={i}><td className={dt.td}>{formatDay(format, x.date)}</td><td className={dt.td}>{x.type === "absence" ? t("absence") : x.place}</td><td className={dt.num}>{x.hours}</td></tr>)}</tbody>
          <tfoot><tr><th scope="row" colSpan={2} className={`${dt.td} border-t border-border text-start`}>{t("total")}</th><td className={`${dt.num} border-t border-border font-semibold`}>{c.total}</td></tr></tfoot>
        </table>
      )}
      <p className="mt-6 text-xs text-muted">{t("issued", { date: formatInstant(format, c.issuedAt) })}</p>
    </main>
  );
}
