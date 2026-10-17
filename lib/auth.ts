import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { resolveLogin } from "@/lib/services/credentials";
import { clearAttempts, clientIp, isLimited, limitKey, recordAttempt } from "@/lib/services/rate-limit";
import { authConfig } from "@/lib/auth.config";
import { DEMO_DOMAIN, devLoginEnabled } from "@/lib/dev-login";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

/** חלונות הגבלת הקצב לניסיונות כניסה כושלים (לפי מייל ולפי כתובת) */
const LOGIN_EMAIL = { max: 8, windowSec: 15 * 60 };
const LOGIN_IP = { max: 40, windowSec: 15 * 60 };

/** מעל המכסה: נזרק מתוך authorize, כך שגם POST ישיר ל-/api/auth/callback/credentials נחסם, לא רק טופס הכניסה */
export class RateLimited extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    // כניסת פיתוח לפי מזהה משתמש הדגמה (ראו lib/dev-login.ts). כבויה אלא אם ENABLE_DEV_LOGIN=1 ולא בייצור
    Credentials({
      id: "dev",
      credentials: { userId: {} },
      async authorize(raw) {
        if (!devLoginEnabled()) return null;
        const parsed = z.object({ userId: z.string().uuid() }).safeParse(raw);
        if (!parsed.success) return null;
        const [u] = await db().select().from(users).where(eq(users.id, parsed.data.userId)).limit(1);
        if (!u || u.status !== "active" || !u.email.toLowerCase().endsWith(DEMO_DOMAIN)) return null;
        return { id: u.id, email: u.email, name: `${u.firstName} ${u.lastName}`.trim(), organizationId: u.organizationId, roles: u.roles };
      },
    }),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        // ההגבלה כאן ולא ב-server action: זה המקום היחיד שכל מסלולי הכניסה עוברים דרכו
        const emailKey = limitKey("login:email", email), ipKey = limitKey("login:ip", clientIp(request.headers));
        if ((await isLimited(db(), emailKey, LOGIN_EMAIL.max, LOGIN_EMAIL.windowSec)) || (await isLimited(db(), ipKey, LOGIN_IP.max, LOGIN_IP.windowSec))) {
          throw new RateLimited();
        }
        const u = await resolveLogin(db(), email, password);
        if (!u) {
          await Promise.all([recordAttempt(db(), emailKey), recordAttempt(db(), ipKey)]);
          return null;
        }
        await clearAttempts(db(), emailKey);
        await db().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
        return {
          id: u.id,
          email: u.email,
          name: `${u.firstName} ${u.lastName}`.trim(),
          organizationId: u.organizationId,
          roles: u.roles,
        };
      },
    }),
  ],
});
