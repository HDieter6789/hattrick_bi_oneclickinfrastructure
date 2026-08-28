/**
 * Pure status/severity -> shadcn Badge `variant` mapping for the admin
 * portal, kept in one place so every list/detail page colors the same
 * status the same way. Each mapping is a `Record<Enum, Variant>` (not a
 * switch) so adding a new enum member without updating the mapping is a
 * TypeScript error, not a silently-uncovered case — see
 * tests/unit/admin-ui-badge-variants.test.ts for the exhaustiveness check.
 */

import type {
  AlertSeverity,
  AlertStatus,
  AuditStatus,
  ConnectionHealth,
  ConnectionStatus,
  CustomerStatus,
  DeploymentStatus,
} from "@/generated/prisma/enums";

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";

const CUSTOMER_STATUS_VARIANTS: Record<CustomerStatus, BadgeVariant> = {
  draft: "outline",
  configuration: "outline",
  ready_for_deployment: "secondary",
  deploying: "secondary",
  active: "default",
  error: "destructive",
  suspended: "destructive",
};

export function customerStatusBadgeVariant(status: CustomerStatus): BadgeVariant {
  return CUSTOMER_STATUS_VARIANTS[status];
}

const ALERT_SEVERITY_VARIANTS: Record<AlertSeverity, BadgeVariant> = {
  info: "outline",
  warning: "secondary",
  critical: "destructive",
};

export function alertSeverityBadgeVariant(severity: AlertSeverity): BadgeVariant {
  return ALERT_SEVERITY_VARIANTS[severity];
}

const ALERT_STATUS_VARIANTS: Record<AlertStatus, BadgeVariant> = {
  open: "destructive",
  acknowledged: "secondary",
  resolved: "outline",
};

export function alertStatusBadgeVariant(status: AlertStatus): BadgeVariant {
  return ALERT_STATUS_VARIANTS[status];
}

const DEPLOYMENT_STATUS_VARIANTS: Record<DeploymentStatus, BadgeVariant> = {
  draft: "outline",
  pending: "secondary",
  running: "secondary",
  partially_failed: "destructive",
  failed: "destructive",
  succeeded: "default",
  cancelled: "outline",
  rolled_back: "outline",
};

export function deploymentStatusBadgeVariant(status: DeploymentStatus): BadgeVariant {
  return DEPLOYMENT_STATUS_VARIANTS[status];
}

const CONNECTION_HEALTH_VARIANTS: Record<ConnectionHealth, BadgeVariant> = {
  unknown: "outline",
  healthy: "default",
  degraded: "secondary",
  failed: "destructive",
};

export function connectionHealthBadgeVariant(health: ConnectionHealth): BadgeVariant {
  return CONNECTION_HEALTH_VARIANTS[health];
}

const CONNECTION_STATUS_VARIANTS: Record<ConnectionStatus, BadgeVariant> = {
  draft: "outline",
  authenticating: "secondary",
  connected: "default",
  error: "destructive",
  disabled: "outline",
};

export function connectionStatusBadgeVariant(status: ConnectionStatus): BadgeVariant {
  return CONNECTION_STATUS_VARIANTS[status];
}

const AUDIT_STATUS_VARIANTS: Record<AuditStatus, BadgeVariant> = {
  success: "outline",
  failure: "destructive",
};

export function auditStatusBadgeVariant(status: AuditStatus): BadgeVariant {
  return AUDIT_STATUS_VARIANTS[status];
}
