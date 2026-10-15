import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { auth } from "@/lib/auth";

export default async function Page() {
  const [t, session] = await Promise.all([getTranslations(), auth()]);
  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">{t("roles.manager")}</h1>
      <p className="mt-2 text-muted">{session?.user.name}</p>
      <Link href="/manager/users" className="mt-4 inline-block underline">{t("nav.users")}</Link>
    </main>
  );
}
