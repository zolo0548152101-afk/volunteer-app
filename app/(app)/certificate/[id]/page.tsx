import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PrintButton } from "@/components/print-button";
import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { hoursCertificate } from "@/lib/services/analytics";

/** תעודת שעות להדפסה / שמירה כ-PDF מהדפדפן. הסטודנט את שלו; רכז את הסטודנטים שלו; מנהל כולם */
export default async function Certificate({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, t, actor] = await Promise.all([params, getTranslations("certificate"), requireActor()]);
  let c;
  try { c = await hoursCertificate(db(), actor, id); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  if (!c) notFound();
  return (
    <main className="mx-auto w-full max-w-2xl p-6 print:p-0">
      <div className="flex items-start justify-between"><h1 className="text-2xl font-semibold">{t("title")}</h1><PrintButton label={t("print")} /></div>
      <p className="mt-4 text-lg">{c.student}</p>
      <p className="text-sm text-muted">{t("year", { name: c.yearName })}{c.track ? ` · ${c.track}` : ""}</p>
      <p className="mt-4">{t("summary", { total: c.total })}{c.target !== null ? ` ${t("ofTarget", { target: c.target })}` : ""}</p>
      {c.items.length === 0 ? <p className="mt-4 text-muted">{t("none")}</p> : (
        <table className="mt-4 w-full text-sm">
          <thead><tr><th scope="col" className="border-b border-border py-1 text-start">{t("date")}</th><th scope="col" className="border-b border-border py-1 text-start">{t("place")}</th><th scope="col" className="border-b border-border py-1 text-start">{t("hours")}</th></tr></thead>
          <tbody>{c.items.map((x, i) => <tr key={i}><td className="py-1">{x.date}</td><td className="py-1">{x.type === "absence" ? t("absence") : x.place}</td><td className="py-1">{x.hours}</td></tr>)}</tbody>
          <tfoot><tr><th scope="row" colSpan={2} className="border-t border-border py-1 text-start">{t("total")}</th><td className="border-t border-border py-1 font-semibold">{c.total}</td></tr></tfoot>
        </table>
      )}
      <p className="mt-6 text-xs text-muted">{t("issued", { date: c.issuedAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }) })}</p>
    </main>
  );
}
