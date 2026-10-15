import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";

export default async function Page() {
  const [t, actor] = await Promise.all([getTranslations(), requireRole("coordinator")]);
  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">{t("roles.coordinator")}</h1>
      <p className="mt-2 text-muted">{actor.name}</p>
      <p className="mt-2 text-muted">{t("common.comingSoon")}</p>
    </main>
  );
}
