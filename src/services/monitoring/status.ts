import type { ServiceStatusColor } from "./types";

/**
 * Pure status-rule layer, deliberately separated from all DB access
 * (services/monitoring/collector.ts owns fetching the facts these
 * functions are given) so it can be unit tested without a database — see
 * tests/unit/monitoring.test.ts.
 */

/** Normalized "was there a recurring job, and how did its most recent run
 * go" fact — the shape `computeServiceStatus` reasons about. The collector
 * adapts Data Platform / Data Freshness / SQL Access facts into this shape;
 * see status.ts's `computeConnectionsStatus`/`computeReportsStatus` for the
 * two areas whose underlying facts don't fit this "recurring job" shape. */
export interface RecurringJobFact {
  /** Most recent run's outcome, or `null` if it has never run at all. */
  lastRunStatus: "succeeded" | "failed" | null;
  /** Attempts taken by the most recent run (1 = succeeded/failed on the
   * first try). Used to detect "succeeded, but only after a retry". */
  lastRunAttempts: number;
  /** When the most recent run finished, or `null` if it never ran. */
  lastRunFinishedAt: Date | null;
  /** Expected interval between runs, or `null` if there is no schedule
   * (e.g. `manual` ingestion, or an area with no freshness expectation) —
   * disables the overdue check entirely. */
  expectedIntervalMs: number | null;
}

export interface ComputeServiceStatusInput {
  now: Date;
  fact: RecurringJobFact;
}

export interface ServiceStatusResult {
  status: ServiceStatusColor;
  reason: string;
}

/**
 * Documented status rules for one "recurring job" area (Data Platform, Data
 * Freshness, SQL Access):
 *
 *  - RED   — the most recent run failed, or no run has ever completed, or
 *            the last successful run is more than 2x its expected interval
 *            overdue.
 *  - YELLOW — the last run succeeded but only after a retry (attempts > 1),
 *            or it's overdue but not yet past the 2x threshold.
 *  - GREEN — otherwise (on schedule, succeeded first try, or no schedule
 *            expectation at all).
 *
 * Evaluated in that order — a failed/never-run job is RED even if it also
 * happens to be "on time" by the overdue check.
 */
export function computeServiceStatus({ now, fact }: ComputeServiceStatusInput): ServiceStatusResult {
  const { lastRunStatus, lastRunAttempts, lastRunFinishedAt, expectedIntervalMs } = fact;

  if (lastRunStatus === null) {
    return { status: "RED", reason: "No successful run has completed yet" };
  }

  if (lastRunStatus === "failed") {
    return { status: "RED", reason: "The most recent run failed" };
  }

  if (expectedIntervalMs !== null && lastRunFinishedAt !== null) {
    const overdueMs = now.getTime() - lastRunFinishedAt.getTime() - expectedIntervalMs;
    if (overdueMs > expectedIntervalMs) {
      return { status: "RED", reason: "More than twice the expected interval has passed since the last successful run" };
    }
    if (overdueMs > 0) {
      return { status: "YELLOW", reason: "The next run is overdue" };
    }
  }

  if (lastRunAttempts > 1) {
    return { status: "YELLOW", reason: "The most recent run succeeded but required a retry" };
  }

  return { status: "GREEN", reason: "Operating normally" };
}

/** Connections don't have a "run" — a connection is either currently
 * healthy or it isn't. Worst-case across the customer's connections wins;
 * no connections configured is treated as GREEN (nothing to report). */
export function computeConnectionsStatus(
  connections: Array<{ health: "unknown" | "healthy" | "degraded" | "failed" }>,
): ServiceStatusResult {
  if (connections.length === 0) {
    return { status: "GREEN", reason: "No connections configured" };
  }
  if (connections.some((c) => c.health === "failed")) {
    return { status: "RED", reason: "At least one connection is failing" };
  }
  if (connections.some((c) => c.health === "degraded" || c.health === "unknown")) {
    return { status: "YELLOW", reason: "At least one connection needs attention" };
  }
  return { status: "GREEN", reason: "All connections are healthy" };
}

/** Reports are static Fabric items, not recurring jobs — status reflects
 * whether the provisioned report item(s) are actually active. No reports
 * provisioned is treated as GREEN (feature gating decides whether this area
 * is shown at all — see collector.ts). */
export function computeReportsStatus(
  reports: Array<{ provisioningStatus: "provisioning" | "active" | "degraded" | "failed" | "deleted" }>,
): ServiceStatusResult {
  if (reports.length === 0) {
    return { status: "GREEN", reason: "No reports provisioned" };
  }
  if (reports.some((r) => r.provisioningStatus === "failed")) {
    return { status: "RED", reason: "At least one report failed to provision" };
  }
  if (reports.some((r) => r.provisioningStatus === "degraded" || r.provisioningStatus === "provisioning")) {
    return { status: "YELLOW", reason: "At least one report is still provisioning or degraded" };
  }
  return { status: "GREEN", reason: "All reports are available" };
}
