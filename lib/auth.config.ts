/** חלק ההגדרות של Auth.js שלא נוגע ב-DB (בטוח ל-proxy). */
import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/lib/permissions";

export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id as string;
        token.organizationId = user.organizationId;
        token.roles = user.roles;
        token.loginAt = Date.now();
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.organizationId = token.organizationId as string;
      session.user.roles = token.roles as Role[];
      return session;
    },
  },
} satisfies NextAuthConfig;
