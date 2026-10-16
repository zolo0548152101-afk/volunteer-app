/** הפניה אופטימית בלבד (cookie). ההרשאה האמיתית נבדקת בשרת, בכל פעולה (lib/permissions.ts). */
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC = ["/login", "/forgot", "/reset", "/invite", "/register", "/accessibility", "/api/auth", "/api/cron"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = pathname === "/" || PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!req.auth && !isPublic) {
    // ל-API עונים 401 במקום להפנות לדף כניסה
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
