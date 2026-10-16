import { afterEach, describe, expect, it, vi } from "vitest";
import { notify, registerProvider, resetProviders } from "@/lib/services/notify";

afterEach(() => {
  resetProviders();
  vi.restoreAllMocks();
});

const base = {
  to: "a@b.co",
  template: "report.submitted",
  locale: "he" as const,
};

describe("notify", () => {
  it("שולח דרך ספק רשום", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    registerProvider("email", { send });
    const res = await notify({ ...base, channel: "email" });
    expect(res).toEqual({ ok: true, channel: "email" });
    expect(send).toHaveBeenCalledOnce();
  });

  it("כישלון בשליחה לא זורק, ומוחזר כשגיאה", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    registerProvider("sms", { send: vi.fn().mockRejectedValue(new Error("boom")) });
    const res = await notify({ ...base, to: "0501234567", channel: "sms" });
    expect(res).toEqual({ ok: false, channel: "sms", error: "boom" });
  });

  it("ספק ברירת מחדל (קונסול) עובד בלי רישום", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await notify({ ...base, channel: "whatsapp" });
    expect(res.ok).toBe(true);
  });

  it("תבנית לא קיימת נכשלת בגלוי ולא נשלחת ריקה", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn().mockResolvedValue(undefined);
    registerProvider("email", { send });
    const r = await notify({ channel: "email", to: "a@b.test", template: "report.pending", locale: "he" });
    expect(r).toMatchObject({ ok: false, error: "unknown_template" });
    expect(send).not.toHaveBeenCalled();
  });
});
