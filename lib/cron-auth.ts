import { timingSafeEqual } from "node:crypto";

/** Vercel Cron שולח Authorization: Bearer <CRON_SECRET>. בלי סוד מוגדר: תמיד סירוב */
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}
