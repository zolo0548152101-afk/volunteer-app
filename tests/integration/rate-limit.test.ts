import { afterAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import { authAttempts } from "@/lib/db/schema";
import { clearAttempts, clientIp, isLimited, limitKey, recordAttempt } from "@/lib/services/rate-limit";

const k = limitKey("test:rl", `user-${Date.now()}@example.test`);
afterAll(async () => {
  await db().delete(authAttempts).where(like(authAttempts.key, "test:rl:%"));
  await closeDb();
});

describe("הגבלת קצב", () => {
  it("חוסם אחרי המכסה בתוך החלון, ומשחרר כשהחלון עבר", async () => {
    const t0 = new Date();
    expect(await isLimited(db(), k, 3, 60, t0)).toBe(false);
    for (let i = 0; i < 3; i++) await recordAttempt(db(), k, t0);
    expect(await isLimited(db(), k, 3, 60, t0)).toBe(true);
    expect(await isLimited(db(), k, 4, 60, t0)).toBe(false); // מכסה גדולה יותר
    // 2 דקות אחרי: הניסיונות מחוץ לחלון של דקה
    expect(await isLimited(db(), k, 3, 60, new Date(t0.getTime() + 120_000))).toBe(false);
  });

  it("מפתחות נפרדים לא משפיעים זה על זה, וה-hash לא חושף את המייל", async () => {
    const other = limitKey("test:rl", "someone-else@example.test");
    expect(await isLimited(db(), other, 1, 60)).toBe(false);
    expect(k).not.toContain("example");
    expect(limitKey("test:rl", " A@B.test ")).toBe(limitKey("test:rl", "a@b.test")); // אותיות ורווחים לא עוקפים
  });

  it("ניקוי אחרי כניסה מוצלחת", async () => {
    await clearAttempts(db(), k);
    const rows = await db().select().from(authAttempts).where(eq(authAttempts.key, k));
    expect(rows).toHaveLength(0);
  });

  it("רשומות ישנות (מעל יממה) נמחקות בכתיבה הבאה", async () => {
    const old = limitKey("test:rl", "old");
    await recordAttempt(db(), old, new Date(Date.now() - 3 * 24 * 3600 * 1000));
    await recordAttempt(db(), limitKey("test:rl", "new"));
    expect(await db().select().from(authAttempts).where(eq(authAttempts.key, old))).toHaveLength(0);
  });

  it("כתובת הלקוח מ-x-forwarded-for (הראשונה ברשימה)", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
