import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { logoutAction } from "@/lib/actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, t] = await Promise.all([auth(), getTranslations("nav")]);
  if (!session) redirect("/login");
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="font-semibold">מלגאים</span>
        <form action={logoutAction}>
          <button type="submit" className="text-sm underline">{t("logout")}</button>
        </form>
      </header>
      {children}
    </div>
  );
}
