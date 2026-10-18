import type { Metadata } from "next";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { dirOf, type Locale } from "@/i18n/config";
import "@fontsource-variable/heebo";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return { title: t("name"), description: t("tagline") };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = (await getLocale()) as Locale;
  const messages = await getMessages();

  return (
    <html lang={locale} dir={dirOf(locale)} className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* מחיל את מצב התצוגה השמור לפני הציור הראשון, כדי שלא יהיה הבהוב */}
        <script dangerouslySetInnerHTML={{ __html: `try{var d=document.documentElement,t=localStorage.getItem("theme"),c=localStorage.getItem("contrast");if(t)d.setAttribute("data-theme",t);if(c)d.setAttribute("data-contrast",c)}catch(e){}` }} />
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
