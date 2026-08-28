/**
 * Pure filter-building for GET /api/admin/audit-log. Isolated from
 * `@/db/prisma` so the filter-combination logic (which of these many
 * optional query params were actually supplied) can be unit-tested without
 * a live DATABASE_URL. The shape returned matches Prisma's
 * `AuditLogWhereInput`, but is expressed structurally here (not imported
 * from `@/generated/prisma/client`) to keep this module import-clean; the
 * one call site (`listAuditLog` in ./audit-log.ts) is what actually hands
 * this to `prisma.auditLog.findMany`.
 */

export interface AuditLogFilterInput {
  userId?: string;
  customerId?: string;
  deploymentId?: string;
  action?: string;
  status?: "success" | "failure";
  from?: Date;
  to?: Date;
}

export interface AuditLogWhere {
  userId?: string;
  customerId?: string;
  deploymentId?: string;
  action?: string;
  status?: "success" | "failure";
  createdAt?: { gte?: Date; lte?: Date };
}

/** Builds a Prisma-shaped `where` clause containing only the filters the
 * caller actually supplied — never `undefined` keys that would otherwise
 * accidentally widen (or Prisma-reject) the query. */
export function buildAuditLogWhere(filters: AuditLogFilterInput): AuditLogWhere {
  const where: AuditLogWhere = {};

  if (filters.userId) where.userId = filters.userId;
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.deploymentId) where.deploymentId = filters.deploymentId;
  if (filters.action) where.action = filters.action;
  if (filters.status) where.status = filters.status;

  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  return where;
}
