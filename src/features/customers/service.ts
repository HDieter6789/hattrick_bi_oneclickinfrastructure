import "server-only";
import { prisma } from "@/db/prisma";
import { requireAuth, requireRole, isInternalRole, INTERNAL_ROLES, ForbiddenError } from "@/lib/authz";
import { requireCustomerAccess } from "@/lib/require-customer-access";
import { childLogger } from "@/lib/logger";
import { writeAuditLog } from "@/lib/audit-log";
import type { Customer } from "@/generated/prisma/client";
import {
  createCustomerInput,
  updateCustomerInput,
  type CreateCustomerDraft,
  type UpdateCustomerDraft,
} from "./schemas";

const log = childLogger({ module: "customers.service" });

/** Every function here is a privileged/customer-scoped server action, per
 * the pattern established in src/features/appointments/service.ts — route
 * handlers under src/app/api/customers are thin wrappers around these. */

/** Internal roles only — this is the admin-side customer roster used to
 * drive the provisioning wizard's Customer step, not the customer-facing
 * portal (which only ever sees its own single customer via
 * requireCustomerAccess). Agent E's admin customer list/detail screens are
 * a separate concern; this stays minimal (list + create + read + update). */
export async function listCustomers(): Promise<Customer[]> {
  await requireRole(...INTERNAL_ROLES);
  return prisma.customer.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createCustomer(draft: CreateCustomerDraft): Promise<Customer> {
  const ctx = await requireRole(...INTERNAL_ROLES);
  const input = createCustomerInput.parse(draft);

  const customer = await prisma.customer.create({
    data: {
      companyName: input.companyName,
      contactFirstName: input.contactFirstName,
      contactLastName: input.contactLastName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      tenantId: input.tenantId,
      domain: input.domain,
      environmentMode: input.environmentMode,
      serviceTier: input.serviceTier,
      status: "draft",
      createdById: ctx.userId,
    },
  });

  await writeAuditLog({
    userId: ctx.userId,
    customerId: customer.id,
    action: "customer.create",
    resourceType: "Customer",
    resourceId: customer.id,
    metadata: { companyName: input.companyName, serviceTier: input.serviceTier },
  });

  log.info({ customerId: customer.id }, "Customer created");
  return customer;
}

export async function getCustomer(customerId: string): Promise<Customer> {
  const ctx = await requireAuth();
  if (!isInternalRole(ctx.role)) {
    await requireCustomerAccess(customerId);
  }
  return prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
}

export async function updateCustomer(customerId: string, draft: UpdateCustomerDraft): Promise<Customer> {
  const ctx = await requireAuth();
  if (!isInternalRole(ctx.role)) {
    // Customers may only update their own record, and never their own
    // status/serviceTier/environmentMode — those are platform-managed.
    await requireCustomerAccess(customerId);
    if (draft.status || draft.serviceTier || draft.environmentMode) {
      throw new ForbiddenError("Customers cannot change status, service tier, or environment mode");
    }
  }

  const input = updateCustomerInput.parse(draft);
  const customer = await prisma.customer.update({ where: { id: customerId }, data: input });

  await writeAuditLog({
    userId: ctx.userId,
    customerId,
    action: "customer.update",
    resourceType: "Customer",
    resourceId: customerId,
    metadata: { fields: Object.keys(input) },
  });

  log.info({ customerId }, "Customer updated");
  return customer;
}
