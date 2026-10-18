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

          <h2 className="mt-8 text-lg font-medium">{t("windows")}</h2>
          {windows.length === 0 && <p className="mt-2 text-muted">{t("noWindows")}</p>}
          <ul className="mt-3 flex flex-col gap-3">
            {windows.map((w) => (
              <li key={w.id} className={`rounded-xl border border-border p-3 ${w.isActive ? "" : "opacity-60"}`}>
                <p className="font-medium">{w.label}{!w.isActive && <span className="ms-2 text-xs">({t("inactive")})</span>}</p>
                <p className="text-sm text-muted">
                  {w.days.map((d) => td(d)).join(", ")} {w.startTime && w.endTime ? <>· <span dir="ltr">{w.startTime.slice(0, 5)}–{w.endTime.slice(0, 5)}</span></> : ""}
                </p>
                <p className="mt-1 text-sm">{t("windowSummary", { slots: w.slots, perSlot: w.hoursPerSlot, requested: w.requestedHours, allocated: w.allocatedSlots, remaining: w.remainingSlots })}</p>
                {canEdit && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm underline">{t("editWindow")}</summary>
                    <form action={updateWindowAction} className="mt-2 flex flex-col gap-3">
                      <input type="hidden" name="placeId" value={id} />
                      <input type="hidden" name="windowId" value={w.id} />
                      <WindowFields w={w} />
                      <SubmitButton className="self-start rounded-lg bg-primary px-4 py-2 text-primary-foreground">{t("save")}</SubmitButton>
                    </form>
                    <form action={toggleWindowAction} className="mt-2">
                      <input type="hidden" name="placeId" value={id} />
                      <input type="hidden" name="windowId" value={w.id} />
                      <input type="hidden" name="active" value={w.isActive ? "0" : "1"} />
                      <SubmitButton className="text-sm underline">{w.isActive ? t("deactivate") : t("activate")}</SubmitButton>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>

          {canEdit && (
            <>
              <h2 className="mt-8 text-lg font-medium">{t("newWindow")}</h2>
              <form action={createWindowAction} className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="placeId" value={id} />
                <WindowFields />
                <SubmitButton className="self-start rounded-lg bg-primary px-4 py-2 text-primary-foreground">{t("addWindow")}</SubmitButton>
              </form>
              <h2 className="mt-8 text-lg font-medium">{t("editPlace")}</h2>
              <form action={updatePlaceAction} className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="placeId" value={id} />
                <PlaceFields place={staff as StaffPlace} categories={categories} />
                <SubmitButton className="self-start rounded-lg bg-primary px-4 py-2 text-primary-foreground">{t("save")}</SubmitButton>
              </form>
            </>
          )}
        </>
      )}
    </main>
  );
}
