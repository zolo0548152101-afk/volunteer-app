import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { resolveLogin } from "@/lib/services/credentials";
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
        const u = await resolveLogin(db(), email, password);
        if (!u) return null;
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
