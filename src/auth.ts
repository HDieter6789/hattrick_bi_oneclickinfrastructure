import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/db/prisma";
import { isDemoMode } from "@/lib/env";
import { authConfig, isEntraConfigured } from "@/auth.config";
import type { PlatformRole } from "@/generated/prisma/enums";

export { isEntraConfigured };

const providers: NonNullable<NextAuthConfig["providers"]> = [...authConfig.providers];

// Demo-mode credentials provider (section 57): lets the app run and be
// tested end to end without a real Entra app registration. Disabled
// entirely unless DEMO_MODE=true — never available in production. This
// (and everything else in this file) is Node-only and must never be
// imported from middleware.ts — see auth.config.ts for the Edge-safe
// subset.
if (isDemoMode()) {
  providers.push(
    Credentials({
      id: "demo",
      name: "Demo Sign-in",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        if (!email) return null;

        const user = await prisma.user.upsert({
          where: { email },
          update: {},
          create: {
            email,
            name: email.split("@")[0],
            role: inferDemoRole(email),
          },
        });

        if (!user.isActive) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  );
}

function inferDemoRole(email: string): PlatformRole {
  if (email.startsWith("admin@")) return "platform_admin";
  if (email.startsWith("agent@")) return "service_agent";
  if (email.startsWith("ops@")) return "operations";
  if (email.startsWith("customeradmin@")) return "customer_admin";
  return "customer_user";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: user.email } });
        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
          token.isActive = dbUser.isActive;
        }
      }
      return token;
    },
    async signIn({ user }) {
      if (!user?.email) return false;
      // Entra sign-ins land here without a DB row yet on first login;
      // create one with the least-privileged default role. An admin must
      // explicitly elevate platform roles afterwards.
      await prisma.user.upsert({
        where: { email: user.email },
        update: { name: user.name ?? undefined, image: user.image ?? undefined },
        create: { email: user.email, name: user.name, image: user.image, role: "customer_user" },
      });
      return true;
    },
  },
});
