/**
 * Pure alert-ordering logic for the admin Alerts screen. Kept free of any
 * `@/db/prisma` import so it can be unit-tested directly (see
 * tests/unit/customer-access.test.ts's module doc for the same rationale).
 */

/** Mirrors prisma's `AlertSeverity` enum (prisma/schema/notification.prisma). */
export type AlertSeverityLiteral = "critical" | "warning" | "info";

export interface AlertSortable {
  severity: AlertSeverityLiteral;
  createdAt: Date;
}

/** Lower rank sorts first — critical alerts always surface above warning
 * above info, regardless of how the underlying rows were fetched. */
export const ALERT_SEVERITY_RANK: Record<AlertSeverityLiteral, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Severity first (critical -> warning -> info), then newest-first within
 * the same severity. Used as the default ordering for the admin Alerts
 * table so the most urgent, most recent alerts are always at the top
 * regardless of the order rows come back from the database. */
export function compareAlertsBySeverityThenRecency(a: AlertSortable, b: AlertSortable): number {
  const rankDiff = ALERT_SEVERITY_RANK[a.severity] - ALERT_SEVERITY_RANK[b.severity];
  if (rankDiff !== 0) return rankDiff;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

export function sortAlertsBySeverity<T extends AlertSortable>(alerts: T[]): T[] {
  return [...alerts].sort(compareAlertsBySeverityThenRecency);
}
