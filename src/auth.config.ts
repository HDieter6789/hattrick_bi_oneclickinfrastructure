import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { getEnv } from "@/lib/env";
import type { PlatformRole } from "@/generated/prisma/enums";

const env = getEnv();

export const isEntraConfigured = Boolean(env.ENTRA_TENANT_ID && env.ENTRA_CLIENT_ID && env.ENTRA_CLIENT_SECRET);

/**
 * Edge-safe subset of the auth config: providers + JWT/session shaping
 * only, no PrismaAdapter and no database access anywhere in this file's
 * import graph. This is what `middleware.ts` uses (middleware runs in the
 * Edge runtime, which cannot load the Node-only Prisma client) — it only
 * needs to decode/verify the session JWT, never to query the database.
 *
 * The full config (src/auth.ts) extends this with the Prisma adapter, the
 * demo Credentials provider, and DB-backed callbacks, and is used
 * everywhere else (route handlers, server components, server actions),
 * all of which run in the Node.js runtime.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  secret: env.AUTH_SECRET,
  providers: isEntraConfigured
    ? [
        MicrosoftEntraID({
          clientId: env.ENTRA_CLIENT_ID!,
          clientSecret: env.ENTRA_CLIENT_SECRET!,
          issuer: `https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/v2.0`,
        }),
      ]
    : [],
  pages: { signIn: "/sign-in" },
  callbacks: {
    authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;
      const publicPaths = ["/sign-in", "/api/auth"];
      if (publicPaths.some((p) => pathname.startsWith(p)) || pathname === "/") return true;
      return Boolean(session?.user?.id);
    },
    jwt({ token }) {
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userId as string) ?? "";
        session.user.role = (token.role as PlatformRole) ?? "customer_user";
        session.user.isActive = (token.isActive as boolean) ?? true;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
