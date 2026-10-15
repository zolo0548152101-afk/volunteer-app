import { describe, expect, it } from "vitest";
import { renderTemplate, TEMPLATES, type TemplateId } from "@/lib/notifications/templates";

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("תבניות הודעה", () => {
  it("לכל תבנית עברית ואנגלית, עם אותם משתנים בשתיהן ובלי טקסט ריק", () => {
    for (const [id, t] of Object.entries(TEMPLATES)) {
      expect(t.he.subject.length, id).toBeGreaterThan(0);
      expect(t.he.body.length, id).toBeGreaterThan(0);
      expect(vars(t.he.subject + t.he.body), id).toEqual(vars(t.en.subject + t.en.body));
    }
  });
  it("ממלא משתנים בשתי השפות ומשאיר ריק משתנה חסר", () => {
    expect(renderTemplate("report.escalation", { student: "נועה", days: 8 }, "he")).toEqual({
      subject: "דיווח ממתין לאישור כבר 8 ימים", body: "הדיווח של נועה ממתין לאישור כבר 8 ימים. נא לטפל בו בתיבת הדיווחים.",
    });
    expect(renderTemplate("report.rejected" satisfies TemplateId, {}, "en")?.body).toBe("Your hour report was rejected. Coordinator's note: ");
  });
  it("תבנית לא מוכרת מחזירה null", () => expect(renderTemplate("nope", {}, "he")).toBeNull());
});
