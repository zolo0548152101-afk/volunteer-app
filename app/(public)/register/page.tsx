import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/shell";
import { RegisterForm } from "@/components/auth/register-form";

export default async function RegisterPage() {
  const t = await getTranslations("register");
  return (
    <AuthShell title={t("title")}>
      <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      <RegisterForm />
    </AuthShell>
  );
}
