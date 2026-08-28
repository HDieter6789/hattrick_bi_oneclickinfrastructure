import { prisma } from "@/db/prisma";
import { getFabricApiClient, FabricApiException, type FabricApiClient } from "@/services/fabric";
import { redactForPersistence } from "@/lib/redact";
import { childLogger } from "@/lib/logger";
import { getEnv } from "@/lib/env";
import { NonRetryableStepError, type StepExecutionContext, type StepExecutor, type StepResult } from "../step-executor";

const log = childLogger({ module: "provisioning.step.create-workspace" });

/**
 * A workspace created purely by the provisioning service principal has no
 * human member at all — internal staff can't see or manage it in the
 * Fabric portal without being explicitly added (learned the hard way: a
 * freshly provisioned workspace was completely invisible to a platform
 * admin until this was added). Grants FABRIC_INTERNAL_ADMIN_PRINCIPAL_ID
 * "Admin" if configured. Deliberately non-fatal: losing internal visibility
 * shouldn't fail a deployment whose actual resource was created fine.
 */
async function grantInternalAdminAccess(client: FabricApiClient, workspaceId: string): Promise<void> {
  const env = getEnv();
  if (!env.FABRIC_INTERNAL_ADMIN_PRINCIPAL_ID) return;

  try {
    await client.post(`/workspaces/${workspaceId}/roleAssignments`, {
      principal: { id: env.FABRIC_INTERNAL_ADMIN_PRINCIPAL_ID, type: env.FABRIC_INTERNAL_ADMIN_PRINCIPAL_TYPE },
      role: "Admin",
    });
    log.info({ workspaceId }, "Granted internal admin access to new workspace");
  } catch (error) {
    log.warn(
      { workspaceId, err: error instanceof Error ? error.message : String(error) },
      "Failed to grant internal admin access to new workspace — continuing, workspace itself was created successfully",
    );
  }
}

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

      await grantInternalAdminAccess(client, response.result.id);

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
