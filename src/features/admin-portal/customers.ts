import "server-only";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { requireRole } from "@/lib/authz";
import { childLogger } from "@/lib/logger";
import { assertCustomerStatusTransitionAllowed, type CustomerStatusLiteral } from "./pure/customer-status";
import type { Customer } from "@/generated/prisma/client";

const log = childLogger({ module: "admin.customers" });

/** Mirrors prisma's `CustomerStatus` enum (prisma/schema/customer.prisma). */
export const customerStatusSchema = z.enum([
  "draft",
  "configuration",
  "ready_for_deployment",
  "deploying",
  "active",
  "error",
  "suspended",
]);

export const listAdminCustomersQuery = z.object({
  status: customerStatusSchema.optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListAdminCustomersDraft = z.input<typeof listAdminCustomersQuery>;

export interface AdminCustomerListItem extends Customer {
  latestDeployment: { id: string; status: string; createdAt: Date; finishedAt: Date | null } | null;
}

export interface AdminCustomerListResult {
  customers: AdminCustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** List/overview for the admin Customers screen — deliberately read-only
 * and read-heavy (see the brief's admin-portal scope): profile, status,
 * and a one-row latest-deployment summary read directly via Prisma, never
 * through Agent D's `/api/customers` or `/api/deployments` routes. */
export async function listAdminCustomers(draft: ListAdminCustomersDraft = {}): Promise<AdminCustomerListResult> {
  await requireRole("platform_admin", "operations", "service_agent");
  const input = listAdminCustomersQuery.parse(draft);

  const where = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.search
      ? {
          OR: [
            { companyName: { contains: input.search, mode: "insensitive" as const } },
            { contactEmail: { contains: input.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { deployments: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, createdAt: true, finishedAt: true } } },
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  const customers = rows.map(({ deployments, ...customer }) => ({
    ...customer,
    latestDeployment: deployments[0] ?? null,
  }));

  return { customers, total, page: input.page, pageSize: input.pageSize };
}

/**
 * Full admin detail view for one customer: profile, configurations,
 * connections (non-secret fields only — never `ConnectionSecretReference`
 * rows or anything from `parametersJson` treated as a credential),
 * deployments, appointments, access grants, and alerts.
 */
export async function getAdminCustomerDetail(id: string) {
  await requireRole("platform_admin", "operations", "service_agent");
  return prisma.customer.findUnique({
    where: { id },
    include: {
      configurations: {
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, architecture: true, status: true, currentVersion: true, createdAt: true, updatedAt: true },
      },
      connections: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          displayName: true,
          connectorTypeKey: true,
          authMethod: true,
          status: true,
          health: true,
          connectedAt: true,
          lastValidationAt: true,
          createdAt: true,
        },
      },
      deployments: {
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, startedAt: true, finishedAt: true, createdAt: true },
      },
      appointments: {
        orderBy: { startTime: "desc" },
        select: { id: true, status: true, startTime: true, endTime: true, serviceAgentId: true },
      },
      accessGrants: {
        orderBy: { createdAt: "desc" },
        select: { id: true, kind: true, principalType: true, groupName: true, fabricRole: true, status: true, grantedAt: true },
      },
      alerts: {
        orderBy: { createdAt: "desc" },
        take: 25,
        select: { id: true, sourceEvent: true, severity: true, status: true, title: true, customerVisible: true, createdAt: true },
      },
    },
  });
}

export const updateCustomerStatusInput = z.object({ status: customerStatusSchema });
export type UpdateCustomerStatusDraft = z.input<typeof updateCustomerStatusInput>;

/** The only mutation this admin surface performs on a customer: a status
 * transition (suspend/reactivate). Everything else about a customer
 * (profile, configuration) is Agent D's territory. Throws
 * `InvalidCustomerStatusTransitionError` (features/admin-portal/pure/customer-status.ts)
 * for a disallowed transition — the route handler maps that to a 400. */
export async function updateAdminCustomerStatus(id: string, draft: UpdateCustomerStatusDraft): Promise<Customer> {
  await requireRole("platform_admin", "operations");
  const input = updateCustomerStatusInput.parse(draft);
  const current = await prisma.customer.findUniqueOrThrow({ where: { id } });
  assertCustomerStatusTransitionAllowed(current.status as CustomerStatusLiteral, input.status as CustomerStatusLiteral);

  const updated = await prisma.customer.update({ where: { id }, data: { status: input.status } });
  log.info({ customerId: id, from: current.status, to: input.status }, "Admin changed customer status");
  return updated;
}
