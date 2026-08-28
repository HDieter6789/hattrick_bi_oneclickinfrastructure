import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";

declare global {
  var __prisma: PrismaClient | undefined;
}

/**
 * Singleton Prisma client using the pg driver adapter (required by the
 * Prisma 7 `prisma-client` generator — see https://pris.ly/d/driver-adapters).
 * In dev, Next.js hot-reloads modules, which would otherwise open a new
 * connection pool per reload — cache the instance on `globalThis`.
 */
function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
