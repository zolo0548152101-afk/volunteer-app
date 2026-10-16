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
import { SubmitButton } from "@/components/submit-button";

export default async function PlacesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor();
  const [t, { error }, list, categories] = await Promise.all([getTranslations("places"), searchParams, listPlaces(db(), actor), loadCategories(db(), actor.organizationId)]);
  const canCreate = can(actor, "create", "place", { organizationId: actor.organizationId });
  const label = new Map(categories.map((c) => [c.key, c.label]));
  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <PlaceError code={error} />
      {list.length === 0 && <p className="mt-4 text-muted">{t("empty")}</p>}
      <ul className="mt-4 flex flex-col gap-3">
        {list.map((p) => {
          const sp = p as Partial<StaffPlace>;
          return (
            <li key={p.id} className="rounded-xl border border-border p-3">
              <Link href={`/places/${p.id}`} className="font-medium underline">{p.name}</Link>
              <p className="text-sm text-muted">{[p.city, p.category ? label.get(p.category) ?? p.category : null].filter(Boolean).join(" · ")}</p>
              {sp.requestedHours !== undefined && (
                <p className="mt-1 text-sm">
                  {t("summary", { requested: sp.requestedHours, remaining: sp.remainingHours ?? 0, students: sp.activeStudents ?? 0 })}
                  {sp.status && sp.status !== "active" && <span className="ms-2 rounded-full border border-border px-2 text-xs">{t(`status.${sp.status}`)}</span>}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {canCreate && (
        <section className="mt-8" aria-labelledby="new-h">
          <h2 id="new-h" className="text-lg font-medium">{t("newPlace")}</h2>
          <form action={createPlaceAction} className="mt-3 flex flex-col gap-3">
            <PlaceFields categories={categories} />
            <SubmitButton className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground">{t("create")}</SubmitButton>
          </form>
        </section>
      )}
    </main>
  );
}
