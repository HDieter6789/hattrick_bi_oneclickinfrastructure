import "server-only";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { requireRole } from "@/lib/authz";
import { childLogger } from "@/lib/logger";
import { sortAlertsBySeverity } from "./pure/alert-sort";
import type { Alert } from "@/generated/prisma/client";

const log = childLogger({ module: "admin.alerts" });

/** Mirrors prisma's `AlertSeverity`/`AlertStatus` enums (prisma/schema/notification.prisma). */
export const alertSeveritySchema = z.enum(["info", "warning", "critical"]);
export const alertStatusSchema = z.enum(["open", "acknowledged", "resolved"]);

export const listAdminAlertsQuery = z.object({
  status: alertStatusSchema.optional(),
  severity: alertSeveritySchema.optional(),
  customerId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListAdminAlertsDraft = z.input<typeof listAdminAlertsQuery>;

export interface AdminAlertListResult {
  alerts: Alert[];
  total: number;
  page: number;
  pageSize: number;
}

/** Lists alerts for the admin Alerts screen. When no explicit severity
 * filter narrows the result to a single severity, the page's default
 * ordering is re-sorted client-of-the-DB-side via `sortAlertsBySeverity`
 * (critical first, then newest-first) so the most urgent open alerts are
 * always at the top regardless of `createdAt`. */
export async function listAdminAlerts(draft: ListAdminAlertsDraft = {}): Promise<AdminAlertListResult> {
  await requireRole("platform_admin", "operations", "service_agent");
  const input = listAdminAlertsQuery.parse(draft);

  const where = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.severity ? { severity: input.severity } : {}),
    ...(input.customerId ? { customerId: input.customerId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.alert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.alert.count({ where }),
  ]);

  const alerts = input.severity ? rows : sortAlertsBySeverity(rows);
  return { alerts, total, page: input.page, pageSize: input.pageSize };
}

export async function getAdminAlert(id: string): Promise<Alert | null> {
  await requireRole("platform_admin", "operations", "service_agent");
  return prisma.alert.findUnique({ where: { id } });
}

export const updateAdminAlertInput = z.object({ status: z.enum(["acknowledged", "resolved"]) });
export type UpdateAdminAlertDraft = z.input<typeof updateAdminAlertInput>;

/** Acknowledges or resolves an alert. Both transitions are allowed from
 * `open`, and `acknowledged -> resolved` is also allowed; anything else
 * (e.g. re-acknowledging an already-resolved alert) is a no-op that still
 * returns the current row, since ack/resolve are idempotent operator
 * actions, not a strict state machine that needs to reject "already done". */
export async function updateAdminAlertStatus(id: string, draft: UpdateAdminAlertDraft): Promise<Alert> {
  await requireRole("platform_admin", "operations");
  const input = updateAdminAlertInput.parse(draft);
  const now = new Date();

  const updated = await prisma.alert.update({
    where: { id },
    data:
      input.status === "acknowledged"
        ? { status: "acknowledged", acknowledgedAt: now }
        : { status: "resolved", resolvedAt: now, acknowledgedAt: now },
  });

  log.info({ alertId: id, status: input.status }, "Admin updated alert status");
  return updated;
}
