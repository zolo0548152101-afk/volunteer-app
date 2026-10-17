import { getToken } from "next-auth/jwt";

/** האם הבקשה הגיעה ב-HTTPS (מאחורי פרוקסי: לפי x-forwarded-proto). ב-HTTPS Auth.js שומר את העוגייה בשם __Secure-authjs.session-token */
export function isSecureRequest(h: Headers): boolean {
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto) return proto === "https";
  return (process.env.AUTH_URL ?? "").startsWith("https://");
}

/** קריאת ה-JWT בלבד, עם שם העוגייה וה-salt הנכונים לפי הפרוטוקול */
export function readSessionToken(h: Headers) {
  return getToken({ req: { headers: h }, secret: process.env.AUTH_SECRET, secureCookie: isSecureRequest(h) });
}
