import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/shell";

export default async function Thanks() {
  const t = await getTranslations("register");
  return (
    <AuthShell title={t("thanksTitle")}>
      <p className="mt-3" role="status">{t("thanksBody")}</p>
      <Link href="/login" className="mt-4 inline-flex min-h-11 items-center text-sm underline">{t("haveAccount")}</Link>
    </AuthShell>
  );
}
