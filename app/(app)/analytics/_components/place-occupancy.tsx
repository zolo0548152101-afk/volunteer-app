import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { DashboardData } from "@/lib/services/analytics";
import { card, CardTitle } from "./ui";

/** פס תפוסה לכל מקום. אדום ≥90% (כמעט מלא), כתום ≤25% (מחכה לסטודנטים), אחרת כחול. היחס כתוב כטקסט ליד הפס */
export async function PlaceOccupancy({ rows }: { rows: DashboardData["placeOccupancy"] }) {
  const t = await getTranslations("dashboard.occupancy");
  const color = (p: number) => (p >= 90 ? "bg-bad" : p <= 25 ? "bg-warn" : "bg-info");
  return (
    <section className={`${card} flex flex-col gap-4`} aria-labelledby="h-occ">
      <CardTitle id="h-occ">{t("title")}</CardTitle>
      {rows.length === 0 ? <p className="text-sm text-ink-3">{t("empty")}</p> : (
        <ul className="flex flex-col gap-3">
          {rows.map((p) => (
            <li key={p.placeId} className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-x-3 gap-y-1.5 text-[13px] sm:grid-cols-[180px_minmax(0,1fr)_60px]">
              <Link href={`/places/${p.placeId}`} className="truncate hover:underline">{p.name}</Link>
              <span className="tabular-nums text-end sm:order-3">{p.allocated}/{p.slots}</span>
              <span role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, p.percent)} aria-label={t("label", { name: p.name, allocated: p.allocated, slots: p.slots })} className="col-span-2 h-2 overflow-hidden rounded-full bg-paper sm:order-2 sm:col-span-1">
                <span className={`block h-full ${color(p.percent)}`} style={{ width: `${Math.min(100, p.percent)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-3">{t("hint")}</p>
    </section>
  );
}
