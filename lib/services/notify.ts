/**
 * שכבת הודעות אחת לכל המערכת. שאר הקוד קורא רק ל-notify().
 * ספקים אמיתיים (מייל / SMS / וואטסאפ) נרשמים דרך registerProvider
 * בלי לגעת בלוגיקה העסקית. בשלב 0 קיים רק ספק קונסול.
 */
import type { Locale } from "@/i18n/config";
import { renderTemplate } from "@/lib/notifications/templates";

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

const providers: Record<Channel, Provider> = {
  email: consoleProvider,
  sms: consoleProvider,
  whatsapp: consoleProvider,
};

export function registerProvider(channel: Channel, provider: Provider) {
  providers[channel] = provider;
}

/** מחזיר את הספקים לברירת המחדל (לבדיקות) */
export function resetProviders() {
  providers.email = consoleProvider;
  providers.sms = consoleProvider;
  providers.whatsapp = consoleProvider;
}

/** לא זורק: כישלון בשליחה לא אמור להפיל פעולה עסקית. הכישלון מוחזר ונרשם. */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  try {
    const text = renderTemplate(input.template, input.data, input.locale);
    if (!text) console.warn(`[notify] unknown template ${input.template}`);
    await providers[input.channel].send({ ...input, subject: text?.subject, body: text?.body });
    return { ok: true, channel: input.channel };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[notify:${input.channel}] failed`, error);
    return { ok: false, channel: input.channel, error };
  }
}
