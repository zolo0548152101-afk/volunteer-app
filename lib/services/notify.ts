/**
 * שכבת הודעות אחת לכל המערכת. שאר הקוד קורא רק ל-notify().
 * ספקים אמיתיים (מייל / SMS / וואטסאפ) נרשמים דרך registerProvider
 * בלי לגעת בלוגיקה העסקית. ברירת מחדל: קונסול; מייל עובר ל-Resend כש-RESEND_API_KEY מוגדר.
 */
import type { Locale } from "@/i18n/config";
import { renderTemplate } from "@/lib/notifications/templates";
import { DEFAULT_FROM, resendProvider } from "@/lib/services/email-resend";

export type Channel = "email" | "sms" | "whatsapp";

export type NotifyInput = {
  channel: Channel;
  /** כתובת מייל או מספר טלפון, לפי הערוץ */
  to: string;
  /** מזהה תבנית, למשל "report.submitted" */
  template: string;
  data?: Record<string, unknown>;
  locale: Locale;
  /** מולאו על ידי notify מהתבנית. ספק אמיתי שולח אותם כמות שהם */
  subject?: string;
  body?: string;
};

export type NotifyResult = { ok: boolean; channel: Channel; error?: string };

export interface Provider {
  send(input: NotifyInput): Promise<void>;
}

const consoleProvider: Provider = {
  async send(input) {
    console.info(
      `[notify:${input.channel}] → ${input.to} · ${input.template} (${input.locale}) · ${input.subject ?? ""}`,
      input.data ?? {},
    );
  },
};

/** מייל: Resend כש-RESEND_API_KEY מוגדר (נבדק בכל שליחה), אחרת קונסול */
const defaultEmail: Provider = {
  async send(input) {
    const key = process.env.RESEND_API_KEY;
    if (!key) return consoleProvider.send(input);
    return resendProvider(key, process.env.EMAIL_FROM || DEFAULT_FROM).send(input);
  },
};

const providers: Record<Channel, Provider> = {
  email: defaultEmail,
  sms: consoleProvider,
  whatsapp: consoleProvider,
};

export function registerProvider(channel: Channel, provider: Provider) {
  providers[channel] = provider;
}

/** מחזיר את הספקים לברירת המחדל (לבדיקות) */
export function resetProviders() {
  providers.email = defaultEmail;
  providers.sms = consoleProvider;
  providers.whatsapp = consoleProvider;
}

/** לא זורק: כישלון בשליחה לא אמור להפיל פעולה עסקית. הכישלון מוחזר ונרשם. */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  try {
    const text = renderTemplate(input.template, input.data, input.locale);
    // תבנית לא קיימת = שליחה ריקה. עדיף כישלון גלוי (נרשם ביומן) מאשר מייל בלי נושא וגוף
    if (!text) {
      console.error(`[notify] unknown template ${input.template}`);
      return { ok: false, channel: input.channel, error: "unknown_template" };
    }
    await providers[input.channel].send({ ...input, subject: text.subject, body: text.body });
    return { ok: true, channel: input.channel };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[notify:${input.channel}] failed`, error);
    return { ok: false, channel: input.channel, error };
  }
}
