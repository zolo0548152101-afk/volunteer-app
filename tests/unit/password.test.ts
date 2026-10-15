import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password", () => {
  it("סיסמה נכונה מאומתת, שגויה נדחית", async () => {
    const h = await hashPassword("demo1234");
    expect(await verifyPassword("demo1234", h)).toBe(true);
    expect(await verifyPassword("demo12345", h)).toBe(false);
  });

  it("כל hash שונה (salt), ולא חושף את הסיסמה", async () => {
    const a = await hashPassword("x");
    const b = await hashPassword("x");
    expect(a).not.toBe(b);
    expect(a).not.toContain("x$");
  });

  it("פורמט פגום נדחה בלי לזרוק", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$a$b")).toBe(false);
  });
});
