import "server-only";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { requireRole } from "@/lib/authz";
import { buildAuditLogWhere } from "./pure/audit-log-filters";

export const listAdminAuditLogQuery = z.object({
  userId: z.string().optional(),
  customerId: z.string().optional(),
  deploymentId: z.string().optional(),
  action: z.string().optional(),
  status: z.enum(["success", "failure"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListAdminAuditLogDraft = z.input<typeof listAdminAuditLogQuery>;

/**
 * Paginated, filterable read of AuditLog rows (append-only — no write
 * route lives here; every mutating route across the app, including this
 * one's own siblings under src/app/api/admin/**, writes inline via
 * features/admin-portal/audit.ts's recordAdminAuditLog). Joined with
 * user/customer for display so the UI never has to do a second round trip.
 */
export async function listAdminAuditLog(draft: ListAdminAuditLogDraft = {}) {
  await requireRole("platform_admin", "operations");
  const input = listAdminAuditLogQuery.parse(draft);
  const where = buildAuditLogWhere(input);

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { name: true, email: true } },
        customer: { select: { companyName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { entries: rows, total, page: input.page, pageSize: input.pageSize };
}
