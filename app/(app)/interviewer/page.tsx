import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";

export default async function Page() {
  const [t, session] = await Promise.all([getTranslations(), auth()]);
  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">{t("roles.interviewer")}</h1>
      <p className="mt-2 text-muted">{session?.user.name}</p>
      <p className="mt-2 text-muted">{t("common.comingSoon")}</p>
    </main>
  );
}
