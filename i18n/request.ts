import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "./config";

// שפה נשמרת בעוגייה (בלי קידומת בנתיב). עברית היא ברירת המחדל.
export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return {
    locale,
    timeZone: "Asia/Jerusalem",
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
