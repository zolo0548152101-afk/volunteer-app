import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/shell";
import { ForgotForm } from "@/components/auth/forgot-form";

export default async function ForgotPage() {
  const t = await getTranslations("auth");
  return <AuthShell title={t("forgotTitle")}><ForgotForm /></AuthShell>;
}
