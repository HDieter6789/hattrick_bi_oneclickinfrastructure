/**
 * Pure tab-visibility logic for the customer portal. Kept framework-free so
 * "which tabs show for this customer's configuration" is unit-testable
 * without rendering anything — the brief requires only enabled features
 * ever appear as a tab (never a customer-facing UI for a feature that
 * wasn't purchased/enabled).
 */

export const PORTAL_TAB_KEYS = ["overview", "data", "sql", "reports", "usage", "appointments", "support"] as const;
export type PortalTabKey = (typeof PORTAL_TAB_KEYS)[number];

export const PORTAL_TAB_LABELS: Record<PortalTabKey, string> = {
  overview: "Overview",
  data: "Data",
  sql: "SQL Access",
  reports: "Reports",
  usage: "Usage",
  appointments: "Appointments",
  support: "Support",
};

export const PORTAL_TAB_PATHS: Record<PortalTabKey, string> = {
  overview: "/portal",
  data: "/portal/data",
  sql: "/portal/sql",
  reports: "/portal/reports",
  usage: "/portal/usage",
  appointments: "/portal/appointments",
  support: "/portal/support",
};

/** The subset of `InfrastructureConfiguration` fields that decide tab
 * visibility. `null` (no finalized configuration yet) shows only the
 * always-on tabs. */
export interface PortalConfigFlags {
  sqlSelfServiceEnabled: boolean;
  semanticModelEnabled: boolean;
  starterReportEnabled: boolean;
  usageReportEnabled: boolean;
}

/**
 * Overview, Data, Appointments, and Support are always shown (every
 * customer has a status, a dataset catalog even if empty, appointment
 * scheduling, and a support contact). SQL Access/Reports/Usage only appear
 * once the corresponding configuration flag is enabled — see
 * docs/ARCHITECTURE.md's customer access boundary: never show a
 * capability the customer wasn't actually granted.
 */
export function getVisiblePortalTabs(flags: PortalConfigFlags | null): PortalTabKey[] {
  const tabs: PortalTabKey[] = ["overview", "data"];
  if (flags?.sqlSelfServiceEnabled) tabs.push("sql");
  if (flags?.semanticModelEnabled || flags?.starterReportEnabled) tabs.push("reports");
  if (flags?.usageReportEnabled) tabs.push("usage");
  tabs.push("appointments", "support");
  return tabs;
}
