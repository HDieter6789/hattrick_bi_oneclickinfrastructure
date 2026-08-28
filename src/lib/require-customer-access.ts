import "server-only";
import { prisma } from "@/db/prisma";
import { requireAuth, isInternalRole, ForbiddenError, type AuthContext } from "@/lib/authz";

/**
 * Verifies the current user may act on the given customer: internal staff
 * (platform_admin/service_agent/operations) may act on any customer;
 * customer_admin/customer_user may only act on a customer they have an
 * active CustomerUser membership for. This is the check every
 * customer-scoped server action/route must run — never trust a
 * client-supplied customerId without it.
 */
export async function requireCustomerAccess(customerId: string): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (isInternalRole(ctx.role)) return ctx;

  const membership = await prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId, userId: ctx.userId } },
  });

  if (!membership || membership.status !== "active") {
    throw new ForbiddenError("You do not have access to this customer");
  }
  return ctx;
}
