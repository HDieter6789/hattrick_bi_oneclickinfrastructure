import { prisma } from "@/db/prisma";
import { getFabricApiClient, FabricApiException } from "@/services/fabric";
import { fabricCapabilityRegistry } from "@/services/fabric/capability-registry";
import { buildFabricPayload, mergeConfigurationModes } from "@/services/fabric/payload-builder";
import { redactForPersistence } from "@/lib/redact";
import { childLogger } from "@/lib/logger";
import { NonRetryableStepError, type StepExecutionContext, type StepExecutor, type StepResult } from "../step-executor";

const log = childLogger({ module: "provisioning.step.create-fabric-item" });

/** Resolves the target workspace's real Fabric id from the deployment's
 * own "workspace" DesiredResource, so item-level DesiredResources don't
 * need to know the workspace id at plan time — it only exists once the
 * create_workspace step has actually run. */
async function resolveDeploymentWorkspaceId(deploymentId: string): Promise<string | undefined> {
  const workspaceResource = await prisma.desiredResource.findUnique({
    where: { deploymentId_logicalName: { deploymentId, logicalName: "workspace" } },
    include: { actualResource: true },
  });
  return workspaceResource?.actualResource?.fabricWorkspaceId;
}

/**
 * The ONE step executor that creates every Fabric item type — Lakehouse,
 * Warehouse, Notebook, Pipeline, SemanticModel, whatever the Capability
 * Registry documents as createSupported. There is deliberately no
 * per-item-type executor: the create request is built generically from
 * FabricCapability + FabricParameterSchema + DesiredResource.configuration
 * (see services/fabric/payload-builder.ts).
 *
 * Idempotency (brief section 30): if this DesiredResource already has an
 * ActualResource row, the item already exists — skip without calling
 * Fabric again.
 */
export const createFabricItemStep: StepExecutor = {
  stepKey: "create_fabric_item",
  name: "Create Fabric item",

  async execute({ desiredResource, correlationId }: StepExecutionContext): Promise<StepResult> {
    if (!desiredResource) {
      throw new NonRetryableStepError("create_fabric_item requires a desiredResource", "MISSING_DESIRED_RESOURCE");
    }

    const existing = await prisma.actualResource.findUnique({ where: { desiredResourceId: desiredResource.id } });
    if (existing) {
      log.info({ desiredResourceId: desiredResource.id, fabricItemId: existing.fabricItemId }, "Resource already exists — skipping create");
      return { outcome: "skipped", resourceId: existing.fabricItemId };
    }

    const capability = await fabricCapabilityRegistry.getCapability(desiredResource.type);
    if (!capability || !capability.enabled || !capability.createSupported) {
      throw new NonRetryableStepError(
        `"${desiredResource.type}" is not currently provisionable via the Fabric API (API provisioning not currently supported)`,
        "CAPABILITY_NOT_PROVISIONABLE",
      );
    }

    const config = desiredResource.configuration as {
      values?: Record<string, unknown>;
      raw?: Record<string, unknown>;
      workspaceId?: string;
      folderId?: string;
    };

    const payload = mergeConfigurationModes(
      buildFabricPayload(capability.parameterSchemas, config.values ?? {}, {
        displayName: desiredResource.displayName,
        type: desiredResource.type,
      }),
      config.raw,
    );
    if (config.folderId && capability.folderSupported) {
      payload.folderId = config.folderId;
    }

    const client = getFabricApiClient();
    const workspaceId = config.workspaceId ?? (await resolveDeploymentWorkspaceId(desiredResource.deploymentId));
    if (!workspaceId) {
      throw new NonRetryableStepError(
        "Resource configuration is missing a target workspaceId and no workspace resource was found for this deployment",
        "MISSING_WORKSPACE",
      );
    }

    try {
      const response = await client.post<{ id: string; displayName: string; type: string }>(
        `/workspaces/${workspaceId}/items`,
        payload,
        { correlationId },
      );

      if (response.status !== "Succeeded" || !response.result) {
        return {
          outcome: "failed",
          errorCode: "FABRIC_ITEM_CREATE_FAILED",
          errorMessage: response.error?.message ?? "Fabric item creation did not succeed",
          requestMetadata: redactForPersistence(payload),
          responseMetadata: redactForPersistence(response.error),
        };
      }

      await prisma.actualResource.create({
        data: {
          desiredResourceId: desiredResource.id,
          fabricWorkspaceId: workspaceId,
          fabricItemId: response.result.id,
          fabricItemType: desiredResource.type,
          provisioningStatus: "active",
        },
      });

      return {
        outcome: "succeeded",
        resourceId: response.result.id,
        requestMetadata: redactForPersistence(payload),
        responseMetadata: redactForPersistence(response.result),
      };
    } catch (error) {
      if (error instanceof FabricApiException) {
        return {
          outcome: "failed",
          errorCode: error.errorCode ?? String(error.status),
          errorMessage: error.message,
          requestMetadata: redactForPersistence(payload),
          responseMetadata: redactForPersistence(error.details),
        };
      }
      throw error;
    }
  },
};
