import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function AccessibilityStatement() {
  const t = await getTranslations("a11y");
  const contact = process.env.A11Y_CONTACT_EMAIL;
  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-4">{t("intro")}</p>
      <h2 className="mt-6 text-lg font-medium">{t("whatWeDidTitle")}</h2>
      <ul className="mt-2 list-disc ps-6">
        {(["standard", "keyboard", "screenReader", "contrast", "mobile", "rtl"] as const).map((k) => <li key={k}>{t(`did.${k}`)}</li>)}
      </ul>
      <h2 className="mt-6 text-lg font-medium">{t("limitsTitle")}</h2>
      <p className="mt-2">{t("limits")}</p>
      <h2 className="mt-6 text-lg font-medium">{t("contactTitle")}</h2>
      <p className="mt-2">{t("contact")}{contact && <> <a href={`mailto:${contact}`} className="underline" dir="ltr">{contact}</a></>}</p>
      <p className="mt-6"><Link href="/" className="underline">{t("back")}</Link></p>
    </main>
  );
}
