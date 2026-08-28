import "server-only";
import { prisma } from "@/db/prisma";
import { redactForPersistence } from "@/lib/redact";
import type { AuthContext } from "@/lib/authz";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Shared helper every mutating route under src/app/api/admin/** calls to
 * append an AuditLog row (append-only, per prisma/schema/audit.prisma's
 * own module doc). Runs `metadata` through redactForPersistence() so a
 * careless caller can never accidentally persist a secret value here.
 */
export interface RecordAdminAuditLogInput {
  actor: AuthContext;
  action: string; // e.g. "blueprint.update"
  resourceType?: string;
  resourceId?: string;
  customerId?: string | null;
  deploymentId?: string | null;
  status?: "success" | "failure";
  metadata?: Record<string, unknown>;
}

export async function recordAdminAuditLog(input: RecordAdminAuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: input.actor.userId,
      customerId: input.customerId ?? undefined,
      deploymentId: input.deploymentId ?? undefined,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      status: input.status ?? "success",
      metadata: input.metadata ? (redactForPersistence(input.metadata) as Prisma.InputJsonValue) : undefined,
    },
  });
}
