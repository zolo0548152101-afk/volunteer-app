/**
 * שכבת הודעות אחת לכל המערכת. שאר הקוד קורא רק ל-notify().
 * ספקים אמיתיים (מייל / SMS / וואטסאפ) נרשמים דרך registerProvider
 * בלי לגעת בלוגיקה העסקית. בשלב 0 קיים רק ספק קונסול.
 */
import type { Locale } from "@/i18n/config";

export type Channel = "email" | "sms" | "whatsapp";

export type NotifyInput = {
  channel: Channel;
  /** כתובת מייל או מספר טלפון, לפי הערוץ */
  to: string;
  /** מזהה תבנית, למשל "report.submitted" */
  template: string;
  data?: Record<string, unknown>;
  locale: Locale;
};

export type NotifyResult = { ok: boolean; channel: Channel; error?: string };

export interface Provider {
  send(input: NotifyInput): Promise<void>;
}

const consoleProvider: Provider = {
  async send(input) {
    console.info(
      `[notify:${input.channel}] → ${input.to} · ${input.template} (${input.locale})`,
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
    await providers[input.channel].send(input);
    return { ok: true, channel: input.channel };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[notify:${input.channel}] failed`, error);
    return { ok: false, channel: input.channel, error };
  }
}
