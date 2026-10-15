import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/shell";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const [t, { token }] = await Promise.all([getTranslations("auth"), searchParams]);
  return (
    <AuthShell title={t("resetTitle")}>
      {token ? <SetPasswordForm token={token} kind="password_reset" /> : <p className="mt-4" role="alert">{t("errors.token")}</p>}
    </AuthShell>
  );
}
