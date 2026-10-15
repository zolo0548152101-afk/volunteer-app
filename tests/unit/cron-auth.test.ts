import { afterEach, describe, expect, it } from "vitest";
import { isCronAuthorized } from "@/lib/cron-auth";

const req = (h?: string) => new Request("http://x/api/cron/escalation", { headers: h ? { authorization: h } : {} });
afterEach(() => { delete process.env.CRON_SECRET; });

describe("הרשאת cron", () => {
  it("בלי סוד מוגדר: תמיד סירוב, גם עם כותרת ריקה", () => {
    expect(isCronAuthorized(req())).toBe(false);
    expect(isCronAuthorized(req("Bearer "))).toBe(false);
  });
  it("רק Bearer מדויק", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isCronAuthorized(req("Bearer s3cret"))).toBe(true);
    expect(isCronAuthorized(req("Bearer s3cre"))).toBe(false);
    expect(isCronAuthorized(req("s3cret"))).toBe(false);
    expect(isCronAuthorized(req())).toBe(false);
  });
});
