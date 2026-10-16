import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { DashboardData } from "@/lib/services/analytics";
import { ageTone, Avatar, card, CardTitle, LinkArrow, Pill } from "./ui";

/** 5 הדיווחים הוותיקים. במחשב טבלה; בטלפון כל שורה מתקפלת לשם + תג (העמודות האמצעיות מוסתרות) */
export async function OldestPending({ rows, escalationDays }: { rows: DashboardData["oldestPending"]; escalationDays: number }) {
  const t = await getTranslations("dashboard.oldest");
  const th = "text-[11px] uppercase tracking-wider text-ink-3";
  return (
    <section className={card} aria-labelledby="h-oldest">
      <CardTitle id="h-oldest" action={<LinkArrow href="/reports?status=pending">{t("all")}</LinkArrow>}>{t("title")}</CardTitle>
      {rows.length === 0 ? <p className="text-sm text-ink-3">{t("empty")}</p> : (
        <table className="w-full text-[13px]">
          <thead><tr className="text-start">
            <th scope="col" className={`${th} py-2 text-start font-medium`}>{t("student")}</th>
            <th scope="col" className={`${th} hidden py-2 text-start font-medium md:table-cell`}>{t("where")}</th>
            <th scope="col" className={`${th} hidden py-2 text-start font-medium md:table-cell`}>{t("coordinator")}</th>
            <th scope="col" className={`${th} py-2 text-start font-medium`}>{t("hours")}</th>
            <th scope="col" className={`${th} py-2 text-start font-medium`}>{t("waiting")}</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-hairline">
                <td className="py-2.5"><span className="flex items-center gap-2"><Avatar id={r.studentId} name={r.studentName} size={26} /><Link href={`/reports?status=pending#${r.id}`} className="font-semibold hover:underline">{r.studentName}</Link></span></td>
                <td className="hidden py-2.5 text-ink-2 md:table-cell">{r.reportType === "absence" ? t("absence") : [r.placeName, r.windowLabel].filter(Boolean).join(" · ")}</td>
                <td className="hidden py-2.5 text-ink-2 md:table-cell">{r.coordinator ?? t("noCoordinator")}</td>
                <td className="py-2.5 tabular-nums">{r.hours}</td>
                <td className="py-2.5"><Pill tone={ageTone(r.days, escalationDays)}>{t("days", { n: r.days })}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
