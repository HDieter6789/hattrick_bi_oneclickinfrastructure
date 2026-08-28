import { prisma } from "@/db/prisma";
import { getEnv } from "@/lib/env";
import { resolveName } from "./naming";
import { topologicalSort } from "./dag";
import type { Prisma } from "@/generated/prisma/client";

export interface PlannedResource {
  logicalName: string;
  type: string;
  displayName: string;
  dependsOn: string[];
  layer?: string;
  configuration: Record<string, unknown>;
}

export interface DeploymentPlan {
  resources: PlannedResource[];
  order: string[];
  summary: { total: number; byType: Record<string, number> };
}

/**
 * Turns an InfrastructureConfiguration (+ its Blueprint) into a concrete,
 * ordered list of resources — the "Terraform-like plan" shown to the user
 * before CREATE (brief section 33). Pure/synchronous business logic: no
 * Fabric calls happen here, only DesiredResource *specs*.
 *
 * `resourceParameterOverrides` (logicalName -> parameter values) lets a
 * caller merge wizard-collected, per-resource parameter values on top of
 * the Blueprint's defaults. Plain data in, plain data out — this function
 * has no opinion on where overrides are persisted before finalization
 * (see the feature layer that calls this for that concern).
 */
export async function generateDeploymentPlan(
  infrastructureConfigurationId: string,
  resourceParameterOverrides: Record<string, Record<string, unknown>> = {},
): Promise<DeploymentPlan> {
  const configuration = await prisma.infrastructureConfiguration.findUniqueOrThrow({
    where: { id: infrastructureConfigurationId },
    include: { customer: true, blueprint: { include: { resources: { orderBy: { sortOrder: "asc" } } } } },
  });

  const env = getEnv();
  const environment = "PROD"; // dev_test_prod expansion tracked as a known limitation, see docs/ARCHITECTURE.md
  const nameContext = { customer: configuration.customer.companyName, environment };

  const resources: PlannedResource[] = [
    {
      logicalName: "workspace",
      type: "Workspace",
      displayName: resolveName(configuration.namingConventionTemplate.replace("{layer}_{type}", "ws"), {
        ...nameContext,
      }),
      dependsOn: [],
      // Without an assigned capacity, a newly created workspace cannot
      // host any items — see services/provisioning/steps/create-workspace.ts.
      configuration: { capacityId: env.FABRIC_CAPACITY_ID },
    },
  ];

  for (const blueprintResource of configuration.blueprint?.resources ?? []) {
    resources.push({
      logicalName: blueprintResource.logicalName,
      type: blueprintResource.itemType,
      displayName: resolveName(blueprintResource.displayNameTemplate, {
        ...nameContext,
        layer: blueprintResource.layer ?? undefined,
        type: blueprintResource.itemType,
      }),
      dependsOn: ["workspace", ...blueprintResource.dependsOn],
      layer: blueprintResource.layer ?? undefined,
      configuration: {
        values: {
          ...((blueprintResource.configuration as Record<string, unknown>) ?? {}),
          ...(resourceParameterOverrides[blueprintResource.logicalName] ?? {}),
        },
        workspaceId: undefined, // resolved at execution time from the "workspace" resource's ActualResource
        folderId: env.FABRIC_DEFAULT_FOLDER_ID,
      },
    });
  }

  if (configuration.semanticModelEnabled && !resources.some((r) => r.type === "SemanticModel")) {
    const goldResource = resources.find((r) => r.layer === "gold" && r.type === "Lakehouse");
    resources.push({
      logicalName: "self_service_semantic_model",
      type: "SemanticModel",
      displayName: resolveName("{customer}_{environment}_gld_model", nameContext),
      dependsOn: goldResource ? ["workspace", goldResource.logicalName] : ["workspace"],
      layer: "gold",
      configuration: { values: {} },
    });
  }

  if (configuration.starterReportEnabled) {
    const semanticModel = resources.find((r) => r.type === "SemanticModel");
    resources.push({
      logicalName: "starter_report",
      type: "Report",
      displayName: resolveName("{customer}_{environment}_starter_rpt", nameContext),
      dependsOn: semanticModel ? ["workspace", semanticModel.logicalName] : ["workspace"],
      layer: "gold",
      configuration: { values: {} },
    });
  }

  const order = topologicalSort(resources.map((r) => ({ logicalName: r.logicalName, dependsOn: r.dependsOn })));
  const byType: Record<string, number> = {};
  for (const r of resources) byType[r.type] = (byType[r.type] ?? 0) + 1;

  return { resources, order, summary: { total: resources.length, byType } };
}

/**
 * Persists a generated plan as a Deployment + DesiredResource rows. Called
 * once the customer confirms the plan in the Review step — this is the
 * "CREATE INFRASTRUCTURE" action, but it only queues the deployment as
 * `draft`; runDeployment() (services/provisioning/engine.ts) does the
 * actual provisioning as a background job.
 */
export async function createDeploymentFromPlan(params: {
  customerId: string;
  infrastructureConfigurationId: string;
  appointmentId: string;
  createdById: string;
  resourceParameterOverrides?: Record<string, Record<string, unknown>>;
}) {
  const plan = await generateDeploymentPlan(params.infrastructureConfigurationId, params.resourceParameterOverrides ?? {});

  return prisma.deployment.create({
    data: {
      customerId: params.customerId,
      infrastructureConfigurationId: params.infrastructureConfigurationId,
      appointmentId: params.appointmentId,
      createdById: params.createdById,
      status: "draft",
      planJson: plan as unknown as Prisma.InputJsonValue,
      desiredResources: {
        create: plan.resources.map((r) => ({
          type: r.type,
          logicalName: r.logicalName,
          displayName: r.displayName,
          configuration: r.configuration as Prisma.InputJsonValue,
          dependsOn: r.dependsOn,
          layer: r.layer,
        })),
      },
    },
    include: { desiredResources: true },
  });
}
