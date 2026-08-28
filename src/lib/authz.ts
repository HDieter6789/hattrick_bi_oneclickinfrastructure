import "server-only";
import { auth } from "@/auth";
import type { PlatformRole } from "@/generated/prisma/enums";

export class UnauthorizedError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Not authorized for this action") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export const INTERNAL_ROLES: PlatformRole[] = ["platform_admin", "service_agent", "operations"];
export const CUSTOMER_ROLES: PlatformRole[] = ["customer_admin", "customer_user"];

export interface AuthContext {
  userId: string;
  email: string;
  role: PlatformRole;
}

/** Resolves the current session into an AuthContext, or throws. Every
 * privileged server action / route handler must call this (or
 * `requireRole`) before doing anything — never trust client-sent role
 * claims. */
export async function requireAuth(): Promise<AuthContext> {
  const session = await auth();
  if (!session?.user?.id || !session.user.isActive) {
    throw new UnauthorizedError();
  }
  return { userId: session.user.id, email: session.user.email ?? "", role: session.user.role };
}

export async function requireRole(...roles: PlatformRole[]): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!roles.includes(ctx.role)) {
    throw new ForbiddenError(`Role '${ctx.role}' is not permitted to perform this action`);
  }
  return ctx;
}

export function isInternalRole(role: PlatformRole): boolean {
  return INTERNAL_ROLES.includes(role);
}
