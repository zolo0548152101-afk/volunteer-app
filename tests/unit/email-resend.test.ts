import { afterEach, describe, expect, it, vi } from "vitest";
import { resendProvider, toHtml } from "@/lib/services/email-resend";

afterEach(() => vi.unstubAllGlobals());

describe("resendProvider", () => {
  it("שולח ל-API עם מפתח, כתובת, נושא וגוף", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await resendProvider("k", "A <a@x.test>").send({ channel: "email", to: "u@x.test", template: "t", locale: "he", subject: "נושא", body: "שלום\nhttps://x.test/a?b=1&c=2" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer k");
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({ from: "A <a@x.test>", to: ["u@x.test"], subject: "נושא" });
    expect(sent.html).toContain('dir="rtl"');
  });

  it("זורק בכישלון, בלי לחשוף את גוף המייל", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"message":"bad"}', { status: 403 })));
    const p = resendProvider("k", "a@x.test").send({ channel: "email", to: "u@x.test", template: "t", locale: "en", subject: "s", body: "secret-link" });
    await expect(p).rejects.toThrow(/^resend_403/);
    await expect(p).rejects.not.toThrow(/secret-link/);
  });
});

describe("toHtml", () => {
  it("בורח מתגיות והופך קישורים ללחיצים", () => {
    const h = toHtml("<b>x</b> https://x.test/p", "en");
    expect(h).toContain("&lt;b&gt;");
    expect(h).toContain('<a href="https://x.test/p">');
    expect(h).toContain('dir="ltr"');
  });
});

describe("toHtml: הזרקה", () => {
  it("מרכאה בקישור לא בורחת מה-href", async () => {
    
    const html = toHtml('לחצו https://x.test/"onmouseover="alert(1) כאן', "he");
    expect(html).not.toMatch(/href="[^"]*"onmouseover/);
    expect(html).not.toContain('"onmouseover=');
  });
});
