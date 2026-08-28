import { prisma } from "@/db/prisma";
import { requireCustomerAccess } from "@/lib/require-customer-access";
import { toErrorResponse } from "@/lib/api-response";
import {
  computeConnectionsStatus,
  computeReportsStatus,
  computeServiceStatus,
  type RecurringJobFact,
  type ServiceStatusEntry,
} from "@/services/monitoring";

interface RouteParams {
  params: Promise<{ customerId: string }>;
}

/**
 * GET /api/portal/[customerId]/overview — the customer portal's landing
 * summary: basic customer info, the most recent deployment's status, and a
 * lightweight service-status readout built directly from
 * services/monitoring's pure status-rule functions.
 *
 * Deliberately NOT the full getCustomerUsageSnapshot pipeline (that's
 * reserved for GET /api/portal/[customerId]/usage) — that snapshot returns
 * an empty serviceStatus list whenever the customer's MonitoringConfiguration
 * is disabled/missing, which would make this landing page blank for a
 * customer who hasn't opted into monitoring yet. This route always shows
 * connections status (every customer has connections or none) and adds
 * dataPlatform/reports status opportunistically based on what's actually
 * provisioned.
 *
 * Response: `{ customer: Customer; latestDeployment: { id: string; status: string; startedAt: string | null; finishedAt: string | null } | null; serviceStatus: ServiceStatusEntry[] }`.
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { customerId } = await params;
    await requireCustomerAccess(customerId);

    const [customer, latestDeployment, connections, infraConfigs, reportResources] = await Promise.all([
      prisma.customer.findUniqueOrThrow({ where: { id: customerId } }),
      prisma.deployment.findFirst({ where: { customerId }, orderBy: { createdAt: "desc" } }),
      prisma.connection.findMany({ where: { customerId } }),
      prisma.infrastructureConfiguration.findMany({ where: { customerId } }),
      prisma.actualResource.findMany({
        where: { fabricItemType: "Report", desiredResource: { deployment: { customerId } } },
        select: { provisioningStatus: true },
      }),
    ]);

    const now = new Date();
    const serviceStatus: ServiceStatusEntry[] = [];

    if (latestDeployment) {
      const fact: RecurringJobFact = {
        lastRunStatus:
          latestDeployment.status === "succeeded"
            ? "succeeded"
            : latestDeployment.status === "failed" ||
                latestDeployment.status === "partially_failed" ||
                latestDeployment.status === "rolled_back"
              ? "failed"
              : null,
        // A per-step retry-attempts lookup would require pulling in
        // DeploymentStep rows this overview doesn't otherwise need — kept
        // at 1 (no known retry) here; the full usage snapshot
        // (getCustomerUsageSnapshot) is the authoritative source for that
        // nuance.
        lastRunAttempts: 1,
        lastRunFinishedAt: latestDeployment.finishedAt,
        expectedIntervalMs: null,
      };
      const result = computeServiceStatus({ now, fact });
      serviceStatus.push({ area: "dataPlatform", label: "Data Platform", status: result.status, reason: result.reason });
    }

    const connectionsResult = computeConnectionsStatus(connections);
    serviceStatus.push({ area: "connections", label: "Connections", status: connectionsResult.status, reason: connectionsResult.reason });

    if (infraConfigs.some((c) => c.starterReportEnabled)) {
      const reportsResult = computeReportsStatus(reportResources);
      serviceStatus.push({ area: "reports", label: "Reports", status: reportsResult.status, reason: reportsResult.reason });
    }

    return Response.json({
      customer,
      latestDeployment: latestDeployment
        ? {
            id: latestDeployment.id,
            status: latestDeployment.status,
            startedAt: latestDeployment.startedAt,
            finishedAt: latestDeployment.finishedAt,
          }
        : null,
      serviceStatus,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
