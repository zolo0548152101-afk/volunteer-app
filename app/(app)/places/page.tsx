import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createPlaceAction } from "@/lib/actions/places";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { listPlaces, type StaffPlace } from "@/lib/services/places";
import { loadCategories } from "@/lib/services/lookups";
import { PlaceFields } from "@/components/places/place-fields";
import { PlaceError } from "@/components/places/place-error";
import { EditDialog } from "@/components/edit-dialog";
import { SubmitButton } from "@/components/submit-button";
import { ListView } from "@/components/list-view";
import { dt, Th } from "@/components/data-table";

export default async function PlacesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor();
  const [t, { error }, list, categories] = await Promise.all([getTranslations("places"), searchParams, listPlaces(db(), actor), loadCategories(db(), actor.organizationId)]);
  const canCreate = can(actor, "create", "place", { organizationId: actor.organizationId });
  const label = new Map(categories.map((c) => [c.key, c.label]));
  const searchOf = (p: (typeof list)[number]) => [p.name, p.city, p.category ? label.get(p.category) ?? p.category : ""].filter(Boolean).join(" ");
  return (
    <main className="mx-auto w-full max-w-5xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        {canCreate && (
          <EditDialog label={`＋ ${t("newPlace")}`} title={t("newPlace")} className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
            <form action={createPlaceAction} className="flex flex-col gap-3">
              <PlaceFields categories={categories} />
              <SubmitButton className="self-start rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">{t("create")}</SubmitButton>
            </form>
          </EditDialog>
        )}
      </div>
      <PlaceError code={error} />
      {list.length === 0 && <p className="mt-4 text-muted">{t("empty")}</p>}
      {list.length > 0 && (
        <ListView storageKey="places" placeholder={t("searchPlaceholder")}
          cards={(
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {list.map((p) => {
                const sp = p as Partial<StaffPlace>;
                const over = (sp.remainingHours ?? 0) < 0;
                return (
                  <li key={p.id} data-search={searchOf(p)} className="rounded-xl border border-hairline bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/places/${p.id}`} className="font-semibold text-info-fg hover:underline">{p.name}</Link>
                      {over && <span className="flex-none rounded-full bg-warn-bg px-2 py-0.5 text-xs text-warn-fg">{t("overTarget")}</span>}
                    </div>
                    <p className="text-sm text-muted">{[p.city, p.category ? label.get(p.category) ?? p.category : null].filter(Boolean).join(" · ")}</p>
                    {sp.requestedHours !== undefined && (
                      <>
                        <Occupancy requested={sp.requestedHours} allocated={sp.allocatedHours ?? 0} label={t("occupancy")} />
                        <p className="mt-1 text-sm">
                          {t("summary", { requested: sp.requestedHours, remaining: sp.remainingHours ?? 0, students: sp.activeStudents ?? 0 })}
                          {sp.status && sp.status !== "active" && <span className="ms-2 rounded-full border border-border px-2 text-xs">{t(`status.${sp.status}`)}</span>}
                        </p>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          table={(
            <table className={dt.table}>
              <thead className={dt.head}><tr>
                <Th sort="text">{t("name")}</Th><Th sort="text" className="hidden md:table-cell">{t("city")}</Th><Th sort="text" className="hidden md:table-cell">{t("category")}</Th>
                <Th sort="num" num>{t("requested")}</Th><Th sort="num" num>{t("remaining")}</Th><Th sort="num" num>{t("activeStudents")}</Th><Th>{t("occupancy")}</Th>
              </tr></thead>
              <tbody className={dt.body}>
                {list.map((p) => {
                  const sp = p as Partial<StaffPlace>;
                  const over = (sp.remainingHours ?? 0) < 0;
                  return (
                    <tr key={p.id} data-search={searchOf(p)} className="hover:bg-paper">
                      <th scope="row" className={`${dt.td} text-start font-medium`}><Link href={`/places/${p.id}`} className="text-info-fg hover:underline">{p.name}</Link></th>
                      <td className={`${dt.td} hidden md:table-cell`}>{p.city ?? "—"}</td>
                      <td className={`${dt.td} hidden md:table-cell`}>{p.category ? label.get(p.category) ?? p.category : "—"}</td>
                      <td className={dt.num}>{sp.requestedHours ?? "—"}</td>
                      <td className={dt.num} data-v={sp.remainingHours ?? 0}>{sp.remainingHours ?? "—"}{over && <span className="ms-2 rounded-full bg-warn-bg px-2 py-0.5 text-xs text-warn-fg">{t("overTarget")}</span>}</td>
                      <td className={dt.num}>{sp.activeStudents ?? "—"}</td>
                      <td className={dt.td}>{sp.requestedHours !== undefined ? <Occupancy requested={sp.requestedHours} allocated={sp.allocatedHours ?? 0} label={t("occupancy")} /> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )} />
      )}
    </main>
  );
}

/** פס תפוסה: משובץ מתוך מבוקש. מעבר ליעד נצבע באזהרה (וגם כתוב בטקסט, לא רק בצבע) */
function Occupancy({ requested, allocated, label }: { requested: number; allocated: number; label: string }) {
  const pct = requested > 0 ? Math.round((allocated / requested) * 100) : 0;
  return (
    <div className="mt-2 flex items-center gap-2" title={`${label}: ${pct}%`}>
      <div role="img" aria-label={`${label}: ${pct}%`} className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-paper">
        <div className={`h-full ${pct > 100 ? "bg-warn" : "bg-primary"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-ink-2">{pct}%</span>
    </div>
  );
}
