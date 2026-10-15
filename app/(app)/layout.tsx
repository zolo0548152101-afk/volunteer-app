import { getTranslations } from "next-intl/server";
import { requireActor } from "@/lib/session";
import { logoutAction } from "@/lib/actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireActor();
  const [t, tApp] = await Promise.all([getTranslations("nav"), getTranslations("app")]);
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="font-semibold">{tApp("name")}</span>
        <form action={logoutAction}>
          <button type="submit" className="text-sm underline">{t("logout")}</button>
        </form>
      </header>
      {children}
    </div>
  );
}
