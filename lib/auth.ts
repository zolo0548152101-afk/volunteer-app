import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/password";
import { authConfig } from "@/lib/auth.config";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const [u] = await db()
          .select()
          .from(users)
          .where(and(sql`lower(${users.email}) = ${email.toLowerCase()}`, eq(users.status, "active")))
          .limit(1);
        // אותה עבודה גם כשהמשתמש לא קיים, כדי לא לחשוף אילו מיילים רשומים
        const hash = u?.passwordHash ?? "scrypt$00$00";
        const ok = await verifyPassword(password, hash);
        if (!u || !u.passwordHash || !ok) return null;
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
