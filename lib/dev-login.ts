/**
 * כניסת פיתוח: בחירת משתמש הדגמה בלי סיסמה, כדי לראות את המערכת בעיניים של כל תפקיד.
 * מופעלת רק כש-ENABLE_DEV_LOGIN=1, אף פעם לא בפריסת ייצור (VERCEL_ENV=production),
 * ורק למשתמשי הדגמה (אימייל ב-@demo.test). ב-Vercel מגדירים את המשתנה רק לסביבת Preview.
 */
export function devLoginEnabled(): boolean {
  return process.env.ENABLE_DEV_LOGIN === "1" && process.env.VERCEL_ENV !== "production";
}

export const DEMO_DOMAIN = "@demo.test";
export const DEMO_ORG_NAME = "ארגון הדגמה";
