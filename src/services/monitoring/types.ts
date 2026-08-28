/** Shared types for the Monitoring Collector (services/monitoring/collector.ts)
 * and its pure status-rule layer (services/monitoring/status.ts). Kept
 * framework-free so status.ts can be unit tested without a database. */

export type ServiceStatusColor = "GREEN" | "YELLOW" | "RED";

export type ServiceStatusArea = "dataPlatform" | "sqlAccess" | "reports" | "dataFreshness" | "connections";

export interface ServiceStatusEntry {
  area: ServiceStatusArea;
  label: string;
  status: ServiceStatusColor;
  /** Short, business-oriented explanation of the color — never a raw
   * Fabric error code or stack trace. */
  reason: string;
}

export interface RefreshHistoryEntry {
  deploymentId: string;
  stepKey: string;
  name: string;
  status: "succeeded" | "failed" | "skipped";
  startedAt: string | null;
  finishedAt: string | null;
}

export interface UsageTrendPoint {
  date: string; // YYYY-MM-DD
  successfulRuns: number;
  failedRuns: number;
}

/** Business-oriented only, per brief section 22/57 — never raw Fabric
 * capacity/administration internals, even when `showAdvancedTechnical` is
 * on. Everything here is derived from this platform's own DB rows, already
 * scoped to one customer. */
export interface AdvancedTechnicalSummary {
  totalResourcesProvisioned: number;
  totalDeployments: number;
  averageStepAttempts: number;
}

export interface CustomerUsageSnapshot {
  customerId: string;
  generatedAt: string; // ISO timestamp
  enabled: boolean;

  serviceStatus: ServiceStatusEntry[];

  lastSuccessfulLoad: string | null;
  nextScheduledLoad: string | null;

  datasetCount: number;
  jobCounts: { succeeded: number; failed: number };

  refreshHistory: RefreshHistoryEntry[];

  usageTrend?: UsageTrendPoint[];
  advancedTechnical?: AdvancedTechnicalSummary;
}
