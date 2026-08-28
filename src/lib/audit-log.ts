import "server-only";
import { prisma } from "@/db/prisma";
import { childLogger } from "@/lib/logger";
import { redactForPersistence } from "@/lib/redact";
import type { AuditStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

const log = childLogger({ module: "audit-log" });

export interface WriteAuditLogInput {
  userId?: string | null;
  customerId?: string | null;
  deploymentId?: string | null;
  /** Dot-style action name, e.g. "deployment.create", "customer.update". */
  action: string;
  resourceType?: string;
  resourceId?: string;
  status?: AuditStatus;
  correlationId?: string;
  /** Arbitrary structured context. Always redacted before persistence (see
   * src/lib/redact.ts) — never pass raw request bodies here verbatim, in
   * case a future field on this route ever carries something sensitive. */
  metadata?: Record<string, unknown>;
}

/**
 * Writes one `AuditLog` row (prisma/schema/audit.prisma). No helper for this
 * existed anywhere in the codebase before this task — every mutating route
 * this feature adds calls this so admin actions (customer/configuration/
 * deployment create-update-start-cancel-rollback) are attributable and
 * reviewable from `/admin/audit` (owned by Agent E).
 *
 * Deliberately swallows its own errors (logged, never thrown) — a failure to
 * write an audit trail must never break the primary action it's describing.
 */
export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? undefined,
        customerId: input.customerId ?? undefined,
        deploymentId: input.deploymentId ?? undefined,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        status: input.status ?? "success",
        correlationId: input.correlationId,
        metadata: input.metadata
          ? (redactForPersistence(input.metadata) as Prisma.InputJsonValue)
          : undefined,
      },
    });
  } catch (error) {
    log.error({ err: error, action: input.action }, "Failed to write audit log entry");
  }
}
