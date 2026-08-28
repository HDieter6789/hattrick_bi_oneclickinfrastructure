import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Uses the Edge-safe auth config (no Prisma adapter) — see auth.config.ts
// for why this must not import from "@/auth" directly.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (!req.auth?.user?.id) {
    if (pathname === "/" || pathname.startsWith("/sign-in") || pathname.startsWith("/api/auth")) {
      return NextResponse.next();
    }
    const signInUrl = new URL("/sign-in", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Coarse area split — fine-grained role checks happen server-side per
  // page/action via requireRole()/requireCustomerAccess(), this is just a
  // fast redirect for the obviously-wrong area.
  const role = req.auth.user.role;
  const isInternal = role === "platform_admin" || role === "service_agent" || role === "operations";

  if (pathname.startsWith("/admin") && !isInternal) {
    return NextResponse.redirect(new URL("/portal", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|ico)$).*)"],
};
