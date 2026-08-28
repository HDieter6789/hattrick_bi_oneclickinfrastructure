import "server-only";
import { prisma } from "@/db/prisma";
import { childLogger } from "@/lib/logger";
import { requireCustomerAccess } from "@/lib/require-customer-access";
import { resolveScheduleIntervalMs } from "@/services/ingestion/schedule";
import type { IngestionScheduleFrequency } from "@/generated/prisma/enums";
import {
  computeConnectionsStatus,
  computeReportsStatus,
  computeServiceStatus,
  type RecurringJobFact,
} from "./status";
import type {
  AdvancedTechnicalSummary,
  CustomerUsageSnapshot,
  RefreshHistoryEntry,
  ServiceStatusColor,
  ServiceStatusEntry,
  UsageTrendPoint,
} from "./types";

const log = childLogger({ module: "monitoring.collector" });

const REFRESH_HISTORY_LIMIT = 10;
const TREND_WINDOW_DAYS = 7;
const STATUS_RANK: Record<ServiceStatusColor, number> = { GREEN: 0, YELLOW: 1, RED: 2 };

function worstOf(results: Array<{ status: ServiceStatusColor; reason: string }>): { status: ServiceStatusColor; reason: string } {
  return results.reduce((worst, current) => (STATUS_RANK[current.status] > STATUS_RANK[worst.status] ? current : worst));
}

/**
 * Gathers customer-scoped operational facts entirely from this platform's
 * own database (Deployment/DeploymentStep/IngestionConfiguration/
 * ActualResource/Connection/SqlEndpoint rows, always filtered by
 * `customerId`) into a `CustomerUsageSnapshot`. Never queries a shared
 * Fabric capacity/administration endpoint — see the "Critical
 * security-design finding" in docs/implementation-plan.md: there is no
 * supported, cross-customer-safe way to query per-workspace capacity
 * consumption, so this collector must not (and does not) attempt to.
 */
export class MonitoringCollectorService {
  async getCustomerUsageSnapshot(customerId: string): Promise<CustomerUsageSnapshot> {
    await requireCustomerAccess(customerId);

    const now = new Date();
    const monitoringConfig = await prisma.monitoringConfiguration.findUnique({ where: { customerId } });

    const base: CustomerUsageSnapshot = {
      customerId,
      generatedAt: now.toISOString(),
      enabled: monitoringConfig?.enabled ?? false,
      serviceStatus: [],
      lastSuccessfulLoad: null,
      nextScheduledLoad: null,
      datasetCount: 0,
      jobCounts: { succeeded: 0, failed: 0 },
      refreshHistory: [],
    };

    if (!monitoringConfig?.enabled) {
      return base;
    }

    const infraConfigs = await prisma.infrastructureConfiguration.findMany({ where: { customerId } });
    const infraConfigIds = infraConfigs.map((c) => c.id);
    // Most recently created configuration stands in for "the customer's
    // current desired setup" — feature flags (sqlSelfServiceEnabled,
    // starterReportEnabled) are read from it.
    const currentConfig = infraConfigs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;

    const [latestDeployment, ingestionConfigs, sqlEndpoints, connections, datasetCount, reportResources] = await Promise.all([
      prisma.deployment.findFirst({ where: { customerId }, orderBy: { createdAt: "desc" } }),
      infraConfigIds.length
        ? prisma.ingestionConfiguration.findMany({ where: { infrastructureConfigurationId: { in: infraConfigIds } } })
        : Promise.resolve([]),
      prisma.sqlEndpoint.findMany({ where: { customerId }, orderBy: { updatedAt: "desc" } }),
      prisma.connection.findMany({ where: { customerId } }),
      prisma.datasetCatalogEntry.count({ where: { customerId } }),
      prisma.actualResource.findMany({
        where: { fabricItemType: "Report", desiredResource: { deployment: { customerId } } },
        select: { provisioningStatus: true },
      }),
    ]);

    base.datasetCount = datasetCount;

    // The single DeploymentStep row backing run_initial_load covers every
    // ingestion configuration in one attempt count (see
    // provisioning/steps/run-initial-load.ts, which loops internally
    // rather than emitting one step per configuration) — reused below for
    // both the Data Platform and Data Freshness areas' "did this need a
    // retry" signal.
    const [runInitialLoadStep, resolveSqlEndpointStep] = latestDeployment
      ? await Promise.all([
          prisma.deploymentStep.findUnique({
            where: { deploymentId_stepKey: { deploymentId: latestDeployment.id, stepKey: "run_initial_load" } },
          }),
          prisma.deploymentStep.findUnique({
            where: { deploymentId_stepKey: { deploymentId: latestDeployment.id, stepKey: "resolve_sql_endpoint" } },
          }),
        ])
      : [null, null];

    if (monitoringConfig.showServiceStatus) {
      base.serviceStatus = this.buildServiceStatus({
        now,
        currentConfig,
        latestDeployment,
        runInitialLoadAttempts: runInitialLoadStep?.attempt ?? 1,
        resolveSqlEndpointAttempts: resolveSqlEndpointStep?.attempt ?? 1,
        ingestionConfigs,
        sqlEndpoints,
        connections,
        reportResources,
        showDataFreshness: monitoringConfig.showDataFreshness,
      });
    }

    if (monitoringConfig.showDataFreshness) {
      const succeededRuns = ingestionConfigs.filter((c) => c.lastRunStatus === "succeeded" && c.lastRunAt);
      base.lastSuccessfulLoad =
        succeededRuns.length > 0
          ? new Date(Math.max(...succeededRuns.map((c) => c.lastRunAt!.getTime()))).toISOString()
          : null;
      base.nextScheduledLoad = this.computeNextScheduledLoad(now, ingestionConfigs);
    }

    if (monitoringConfig.showRefreshSuccess && latestDeployment) {
      const [succeeded, failed, historySteps] = await Promise.all([
        prisma.deploymentStep.count({ where: { deployment: { customerId }, status: "succeeded" } }),
        prisma.deploymentStep.count({ where: { deployment: { customerId }, status: "failed" } }),
        prisma.deploymentStep.findMany({
          where: { deployment: { customerId }, stepKey: "run_initial_load" },
          orderBy: { updatedAt: "desc" },
          take: REFRESH_HISTORY_LIMIT,
        }),
      ]);
      base.jobCounts = { succeeded, failed };
      base.refreshHistory = historySteps.map(
        (step): RefreshHistoryEntry => ({
          deploymentId: step.deploymentId,
          stepKey: step.stepKey,
          name: step.name,
          status: step.status === "succeeded" || step.status === "failed" || step.status === "skipped" ? step.status : "failed",
          startedAt: step.startedAt?.toISOString() ?? null,
          finishedAt: step.finishedAt?.toISOString() ?? null,
        }),
      );
    }

    if (monitoringConfig.showUsageTrend) {
      base.usageTrend = await this.buildUsageTrend(customerId, now);
    }

    if (monitoringConfig.showAdvancedTechnical) {
      base.advancedTechnical = await this.buildAdvancedTechnicalSummary(customerId);
    }

    log.debug({ customerId }, "Customer usage snapshot generated");
    return base;
  }

  private buildServiceStatus(params: {
    now: Date;
    currentConfig: { sqlSelfServiceEnabled: boolean; starterReportEnabled: boolean } | null;
    latestDeployment: { status: string; finishedAt: Date | null } | null;
    runInitialLoadAttempts: number;
    resolveSqlEndpointAttempts: number;
    ingestionConfigs: Array<{ lastRunStatus: string | null; lastRunAt: Date | null; scheduleFrequency: IngestionScheduleFrequency }>;
    sqlEndpoints: Array<{ provisioningStatus: string; updatedAt: Date }>;
    connections: Array<{ health: "unknown" | "healthy" | "degraded" | "failed" }>;
    reportResources: Array<{ provisioningStatus: "provisioning" | "active" | "degraded" | "failed" | "deleted" }>;
    showDataFreshness: boolean;
  }): ServiceStatusEntry[] {
    const {
      now,
      currentConfig,
      latestDeployment,
      runInitialLoadAttempts,
      resolveSqlEndpointAttempts,
      ingestionConfigs,
      sqlEndpoints,
      connections,
      reportResources,
      showDataFreshness,
    } = params;

    const entries: ServiceStatusEntry[] = [];

    if (latestDeployment) {
      const dataPlatformFact: RecurringJobFact = {
        lastRunStatus:
          latestDeployment.status === "succeeded"
            ? "succeeded"
            : latestDeployment.status === "failed" ||
                latestDeployment.status === "partially_failed" ||
                latestDeployment.status === "rolled_back"
              ? "failed"
              : null,
        lastRunAttempts: runInitialLoadAttempts,
        lastRunFinishedAt: latestDeployment.finishedAt,
        expectedIntervalMs: null,
      };
      const result = computeServiceStatus({ now, fact: dataPlatformFact });
      entries.push({ area: "dataPlatform", label: "Data Platform", status: result.status, reason: result.reason });
    }

    if (showDataFreshness && ingestionConfigs.length > 0) {
      const perConfigResults = ingestionConfigs.map((config) => {
        const fact: RecurringJobFact = {
          lastRunStatus: config.lastRunStatus === "succeeded" ? "succeeded" : config.lastRunStatus ? "failed" : null,
          lastRunAttempts: runInitialLoadAttempts,
          lastRunFinishedAt: config.lastRunAt,
          expectedIntervalMs: resolveScheduleIntervalMs(config.scheduleFrequency),
        };
        return computeServiceStatus({ now, fact });
      });
      const worst = worstOf(perConfigResults);
      entries.push({ area: "dataFreshness", label: "Data Freshness", status: worst.status, reason: worst.reason });
    }

    if (currentConfig?.sqlSelfServiceEnabled) {
      const endpoint = sqlEndpoints[0] ?? null;
      const fact: RecurringJobFact = {
        lastRunStatus: endpoint?.provisioningStatus === "Success" ? "succeeded" : endpoint?.provisioningStatus === "Failed" ? "failed" : null,
        lastRunAttempts: resolveSqlEndpointAttempts,
        lastRunFinishedAt: endpoint?.updatedAt ?? null,
        expectedIntervalMs: null,
      };
      const result = computeServiceStatus({ now, fact });
      entries.push({ area: "sqlAccess", label: "SQL Access", status: result.status, reason: result.reason });
    }

    if (currentConfig?.starterReportEnabled) {
      const result = computeReportsStatus(reportResources);
      entries.push({ area: "reports", label: "Reports", status: result.status, reason: result.reason });
    }

    const connectionsResult = computeConnectionsStatus(connections);
    entries.push({ area: "connections", label: "Connections", status: connectionsResult.status, reason: connectionsResult.reason });

    return entries;
  }

  private computeNextScheduledLoad(
    now: Date,
    ingestionConfigs: Array<{ lastRunAt: Date | null; scheduleFrequency: IngestionScheduleFrequency }>,
  ): string | null {
    const nextRuns = ingestionConfigs
      .map((config) => {
        const intervalMs = resolveScheduleIntervalMs(config.scheduleFrequency);
        if (intervalMs === null) return null; // manual — no schedule
        const base = config.lastRunAt ?? now;
        return base.getTime() + intervalMs;
      })
      .filter((t): t is number => t !== null);

    if (nextRuns.length === 0) return null;
    return new Date(Math.min(...nextRuns)).toISOString();
  }

  private async buildUsageTrend(customerId: string, now: Date): Promise<UsageTrendPoint[]> {
    const windowStart = new Date(now.getTime() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const steps = await prisma.deploymentStep.findMany({
      where: {
        deployment: { customerId },
        stepKey: "run_initial_load",
        finishedAt: { gte: windowStart },
      },
      select: { status: true, finishedAt: true },
    });

    const byDate = new Map<string, UsageTrendPoint>();
    for (let i = TREND_WINDOW_DAYS - 1; i >= 0; i -= 1) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      byDate.set(date, { date, successfulRuns: 0, failedRuns: 0 });
    }

    for (const step of steps) {
      if (!step.finishedAt) continue;
      const date = step.finishedAt.toISOString().slice(0, 10);
      const point = byDate.get(date);
      if (!point) continue;
      if (step.status === "succeeded") point.successfulRuns += 1;
      else if (step.status === "failed") point.failedRuns += 1;
    }

    return Array.from(byDate.values());
  }

  private async buildAdvancedTechnicalSummary(customerId: string): Promise<AdvancedTechnicalSummary> {
    const [totalResourcesProvisioned, totalDeployments, steps] = await Promise.all([
      prisma.actualResource.count({ where: { desiredResource: { deployment: { customerId } } } }),
      prisma.deployment.count({ where: { customerId } }),
      prisma.deploymentStep.findMany({ where: { deployment: { customerId } }, select: { attempt: true } }),
    ]);

    const averageStepAttempts =
      steps.length > 0 ? steps.reduce((sum, s) => sum + s.attempt, 0) / steps.length : 0;

    return { totalResourcesProvisioned, totalDeployments, averageStepAttempts };
  }
}

export const monitoringCollector = new MonitoringCollectorService();

export async function getCustomerUsageSnapshot(customerId: string): Promise<CustomerUsageSnapshot> {
  return monitoringCollector.getCustomerUsageSnapshot(customerId);
}
