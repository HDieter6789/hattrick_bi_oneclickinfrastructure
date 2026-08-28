import { prisma } from "@/db/prisma";
import { getFabricApiClient, FabricApiException } from "@/services/fabric";
import { redactForPersistence } from "@/lib/redact";
import { childLogger } from "@/lib/logger";
import { NonRetryableStepError, type StepExecutionContext, type StepExecutor, type StepResult } from "../step-executor";

const log = childLogger({ module: "provisioning.step.create-workspace" });

/**
 * Dedicated executor for Fabric workspace creation (`POST /v1/workspaces`),
 * which is not an "item" the way Lakehouse/Notebook/etc. are — different
 * endpoint, different payload shape. Everything else goes through the
 * generic create-fabric-item step; see step-registry.ts for the override
 * mechanism.
 */
export const createWorkspaceStep: StepExecutor = {
  stepKey: "create_workspace",
  name: "Create Fabric workspace",

  async execute({ desiredResource, correlationId }: StepExecutionContext): Promise<StepResult> {
    if (!desiredResource) {
      throw new NonRetryableStepError("create_workspace requires a desiredResource", "MISSING_DESIRED_RESOURCE");
    }

    const existing = await prisma.actualResource.findUnique({ where: { desiredResourceId: desiredResource.id } });
    if (existing) {
      log.info({ desiredResourceId: desiredResource.id }, "Workspace already exists — skipping create");
      return { outcome: "skipped", resourceId: existing.fabricItemId };
    }

    const config = desiredResource.configuration as { capacityId?: string; domainId?: string };
    const payload: Record<string, unknown> = { displayName: desiredResource.displayName };
    if (config.capacityId) payload.capacityId = config.capacityId;
    if (config.domainId) payload.domainId = config.domainId;

    const client = getFabricApiClient();
    try {
      const response = await client.post<{ id: string; displayName: string }>("/workspaces", payload, { correlationId });

      if (response.status !== "Succeeded" || !response.result) {
        return {
          outcome: "failed",
          errorCode: "WORKSPACE_CREATE_FAILED",
          errorMessage: response.error?.message ?? "Workspace creation did not succeed",
        };
      }

      await prisma.actualResource.create({
        data: {
          desiredResourceId: desiredResource.id,
          fabricWorkspaceId: response.result.id,
          fabricItemId: response.result.id,
          fabricItemType: "Workspace",
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
        return { outcome: "failed", errorCode: error.errorCode ?? String(error.status), errorMessage: error.message };
      }
      throw error;
    }
  },
};
