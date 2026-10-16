import { getFormatter, getTranslations } from "next-intl/server";
import { card, CardTitle, Pill } from "./ui";

/**
 * עמודות לחודשים. הגרף LTR (זמן רץ משמאל לימין) ו-aria-hidden; הטבלה sr-only היא החלופה הנגישה.
 * הערכים כתובים מעל העמודות, כדי שלא יהיה צורך בציר.
 */
export async function MonthChart({ data }: { data: { label: string; value: number }[] }) {
  const [t, format] = await Promise.all([getTranslations("dashboard.monthChart"), getFormatter()]);
  const max = Math.max(...data.map((d) => d.value), 1);
  const avg = data.length ? Math.round(data.reduce((a, d) => a + d.value, 0) / data.length) : 0;
  const month = (ym: string, style: "short" | "long") => format.dateTime(new Date(`${ym}-01T00:00:00Z`), { month: style, timeZone: "UTC" });
  return (
    <section className={`${card} flex flex-col gap-4`} aria-labelledby="h-month">
      <CardTitle id="h-month" action={data.length > 0 ? <Pill tone="ok">{t("avg", { n: avg })}</Pill> : undefined}>{t("title")}</CardTitle>
      {data.length === 0 ? <p className="text-sm text-ink-3">{t("empty")}</p> : (
        <>
          <div dir="ltr" aria-hidden="true" className="flex h-52 items-end justify-center gap-2.5 pt-2">
            {data.map((d) => (
              <div key={d.label} className="flex min-w-0 max-w-24 flex-1 flex-col items-center justify-end gap-1.5 self-stretch">
                <span className="text-[11px] tabular-nums text-ink-2">{d.value}</span>
                <b className="block w-full rounded-t-md bg-ok" style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} />
                <span className="text-[11px] text-ink-3">{month(d.label, "short")}</span>
              </div>
            ))}
          </div>
          <table className="sr-only"><caption>{t("table")}</caption><tbody>{data.map((d) => <tr key={d.label}><th scope="row">{month(d.label, "long")}</th><td>{d.value}</td></tr>)}</tbody></table>
        </>
      )}
    </section>
  );
}
