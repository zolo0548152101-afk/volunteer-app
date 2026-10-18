import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createWindowAction, toggleWindowAction, updatePlaceAction, updateWindowAction } from "@/lib/actions/places";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { getPlace, type StaffPlace } from "@/lib/services/places";
import { loadCategories } from "@/lib/services/lookups";
import { NotFoundError } from "@/lib/services/users";
import { ForbiddenError } from "@/lib/permissions";
import { PlaceFields } from "@/components/places/place-fields";
import { WindowFields } from "@/components/places/window-form";
import { PlaceError } from "@/components/places/place-error";
import { EditDialog } from "@/components/edit-dialog";
import { SubmitButton } from "@/components/submit-button";

export default async function PlaceCard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, { error }, actor, t, td] = await Promise.all([params, searchParams, requireActor(), getTranslations("places"), getTranslations("days")]);
  let data;
  try {
    data = await getPlace(db(), actor, id);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound();
    throw e;
  }
  const categories = await loadCategories(db(), actor.organizationId);
  const { place, windows } = data;
  const staff = place as Partial<StaffPlace>;
  const isStaff = staff.requestedHours !== undefined;
  const canEdit = can(actor, "update", "place", { organizationId: actor.organizationId });
  const catLabel = categories.find((c) => c.key === place.category)?.label;

  return (
    <main className="mx-auto w-full max-w-5xl p-4">
      <Link href="/places" className="text-sm underline">{t("back")}</Link>
      <h1 className="mt-2 text-xl font-semibold">{place.name}</h1>
      <p className="text-sm text-muted">{[place.address, place.city, catLabel].filter(Boolean).join(" · ")}</p>
      {place.description && <p className="mt-2">{place.description}</p>}
      <PlaceError code={error} />

      {isStaff && (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              [t("requested"), staff.requestedHours],
              [t("allocated"), staff.allocatedHours],
              [t("remaining"), staff.remainingHours],
              [t("activeStudents"), staff.activeStudents],
              [t("approvedThisYear"), staff.approvedHoursThisYear],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-lg border border-border p-2"><dt className="text-muted">{k}</dt><dd className="text-lg font-semibold">{v}</dd></div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-muted">
            {t("contact")}: {[staff.contactName, staff.contactPhone, staff.contactEmail].filter(Boolean).join(" · ") || "-"}
          </p>
          {staff.notes && <p className="mt-1 text-sm text-muted">{staff.notes}</p>}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">{t("windows")}</h2>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <EditDialog label={`＋ ${t("newWindow")}`} title={t("newWindow")} className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
                  <form action={createWindowAction} className="flex flex-col gap-3">
                    <input type="hidden" name="placeId" value={id} />
                    <WindowFields />
                    <SubmitButton className="self-start rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">{t("addWindow")}</SubmitButton>
                  </form>
                </EditDialog>
                <EditDialog label={t("editPlace")} title={t("editPlace")} className="inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm hover:bg-paper">
                  <form action={updatePlaceAction} className="flex flex-col gap-3">
                    <input type="hidden" name="placeId" value={id} />
                    <PlaceFields place={staff as StaffPlace} categories={categories} />
                    <SubmitButton className="self-start rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">{t("save")}</SubmitButton>
                  </form>
                </EditDialog>
              </div>
            )}
          </div>
          {windows.length === 0 && <p className="mt-2 text-muted">{t("noWindows")}</p>}
          {windows.length > 0 && (
            <div role="region" aria-label={t("windows")} tabIndex={0} className="mt-3 overflow-x-auto rounded-xl border border-hairline bg-card">
              <table className="w-full text-sm">
                <thead className="bg-paper text-xs text-ink-3"><tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("windowLabel")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("days")}</th>
                  <th scope="col" className="hidden px-3 py-2 text-start font-medium md:table-cell">{t("from")}–{t("to")}</th>
                  <th scope="col" className="hidden px-3 py-2 text-start font-medium md:table-cell">{t("slots")}</th>
                  <th scope="col" className="hidden px-3 py-2 text-start font-medium md:table-cell">{t("statusCol")}</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">{t("editWindow")}</span></th>
                </tr></thead>
                <tbody className="divide-y divide-hairline">
                  {windows.map((w) => (
                    <tr key={w.id} className={w.isActive ? "" : "opacity-70"}>
                      <th scope="row" className="px-3 py-2.5 text-start font-medium">{w.label}</th>
                      <td className="px-3 py-2.5">{w.days.map((d) => td(d)).join(", ") || "—"}</td>
                      <td className="hidden px-3 py-2.5 md:table-cell">{w.startTime && w.endTime ? <span dir="ltr">{w.startTime.slice(0, 5)}–{w.endTime.slice(0, 5)}</span> : "—"}</td>
                      <td className="hidden px-3 py-2.5 md:table-cell">{t("windowSummary", { slots: w.slots, perSlot: w.hoursPerSlot, requested: w.requestedHours, allocated: w.allocatedSlots, remaining: w.remainingSlots })}</td>
                      <td className="hidden px-3 py-2.5 md:table-cell"><span className={`rounded-full px-2 py-0.5 text-xs ${w.isActive ? "bg-ok-bg text-ok-fg" : "bg-paper text-ink-3"}`}>{w.isActive ? t("activeBadge") : t("inactive")}</span></td>
                      <td className="px-3 py-2.5 text-end">
                        {canEdit && (
                          <EditDialog label={t("editRow")} title={`${t("editWindow")}: ${w.label}`}>
                            <form action={updateWindowAction} className="flex flex-col gap-3">
                              <input type="hidden" name="placeId" value={id} />
                              <input type="hidden" name="windowId" value={w.id} />
                              <WindowFields w={w} />
                              <SubmitButton className="self-start rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">{t("save")}</SubmitButton>
                            </form>
                            <form action={toggleWindowAction} className="mt-4 border-t border-hairline pt-3">
                              <input type="hidden" name="placeId" value={id} />
                              <input type="hidden" name="windowId" value={w.id} />
                              <input type="hidden" name="active" value={w.isActive ? "0" : "1"} />
                              <SubmitButton className="min-h-10 rounded-lg border border-border px-4 text-sm hover:bg-paper">{w.isActive ? t("deactivate") : t("activate")}</SubmitButton>
                            </form>
                          </EditDialog>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
