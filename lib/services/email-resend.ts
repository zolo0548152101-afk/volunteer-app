/**
 * ספק מייל דרך Resend (HTTP ישיר, בלי SDK). מופעל אוטומטית כש-RESEND_API_KEY מוגדר;
 * בלעדיו נשאר ספק הקונסול, כך שפיתוח ובדיקות לא שולחים כלום.
 * הכתובת השולחת: EMAIL_FROM. ברירת המחדל onboarding@resend.dev שולחת רק לבעל חשבון Resend (מתאים לבדיקות).
 */
import type { NotifyInput, Provider } from "@/lib/services/notify";

export const DEFAULT_FROM = "Volunteers <onboarding@resend.dev>";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** טקסט פשוט ל-HTML מינימלי, עם כיוון לפי השפה. קישורים נשארים לחיצים */
export function toHtml(body: string, locale: string): string {
  const linked = esc(body).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br>");
  const dir = locale === "he" ? "rtl" : "ltr";
  return `<div dir="${dir}" style="font-family:system-ui,Arial,sans-serif;font-size:16px;line-height:1.6">${linked}</div>`;
}

export function resendProvider(apiKey: string, from: string): Provider {
  return {
    async send(input: NotifyInput) {
      const body = input.body ?? "";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [input.to], subject: input.subject ?? "", text: body, html: toHtml(body, input.locale) }),
      });
      if (!res.ok) {
        // לא מדפיסים את גוף הבקשה (מכיל קישורי הזמנה). רק סטטוס והודעת השגיאה של השירות
        const detail = await res.text().catch(() => "");
        throw new Error(`resend_${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
      }
    },
  };
}
