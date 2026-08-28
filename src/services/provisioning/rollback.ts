import { prisma } from "@/db/prisma";
import { childLogger } from "@/lib/logger";
import { getFabricApiClient } from "@/services/fabric";
import { fabricCapabilityRegistry } from "@/services/fabric/capability-registry";

const log = childLogger({ module: "provisioning.rollback" });

/** Per-item-type policy for whether an automatic rollback delete is
 * allowed. Identities/permissions and anything Fabric doesn't document
 * delete support for are never auto-deleted (brief section 31). */
export interface RollbackSafety {
  rollbackSafe: boolean;
  manualReviewRequired: boolean;
  neverAutoDelete: boolean;
}

export async function getRollbackSafety(itemType: string): Promise<RollbackSafety> {
  const capability = await fabricCapabilityRegistry.getCapability(itemType);
  if (!capability?.deleteSupported) {
    return { rollbackSafe: false, manualReviewRequired: true, neverAutoDelete: true };
  }
  // Data-bearing storage items (Lakehouse/Warehouse) are technically
  // delete-supported but deliberately routed to manual review — an
  // automated rollback must never silently destroy customer data.
  if (capability.category === "storage") {
    return { rollbackSafe: false, manualReviewRequired: true, neverAutoDelete: false };
  }
  return { rollbackSafe: true, manualReviewRequired: false, neverAutoDelete: false };
}

/**
 * Executes ROLLBACK_CREATED_RESOURCES for a failed/cancelled deployment:
 * deletes only resources whose capability is rollback-safe, in reverse
 * dependency order, and leaves everything else (identities, storage) for
 * manual admin review rather than auto-deleting it.
 */
export async function rollbackDeployment(deploymentId: string): Promise<{ deleted: string[]; requiresManualReview: string[] }> {
  const deployment = await prisma.deployment.findUniqueOrThrow({
    where: { id: deploymentId },
    include: { desiredResources: { include: { actualResource: true } } },
  });

  if (deployment.rollbackPolicy === "KEEP_SUCCESSFUL_RESOURCES") {
    log.info({ deploymentId }, "Rollback policy is KEEP_SUCCESSFUL_RESOURCES — nothing to roll back");
    return { deleted: [], requiresManualReview: [] };
  }

  const client = getFabricApiClient();
  const deleted: string[] = [];
  const requiresManualReview: string[] = [];

  // Reverse of creation order approximated by reverse dependsOn depth —
  // simplest correct approach: delete resources with no dependents first.
  const hasDependent = new Set(deployment.desiredResources.flatMap((r) => r.dependsOn));
  const deletionOrder = [...deployment.desiredResources].sort((a, b) => {
    const aLeaf = hasDependent.has(a.logicalName) ? 0 : 1;
    const bLeaf = hasDependent.has(b.logicalName) ? 0 : 1;
    return bLeaf - aLeaf;
  });

  for (const resource of deletionOrder) {
    if (!resource.actualResource) continue;
    const safety = await getRollbackSafety(resource.type);

    if (!safety.rollbackSafe || safety.neverAutoDelete) {
      requiresManualReview.push(resource.logicalName);
      continue;
    }

    await client.delete(`/workspaces/${resource.actualResource.fabricWorkspaceId}/items/${resource.actualResource.fabricItemId}`);
    await prisma.actualResource.update({ where: { id: resource.actualResource.id }, data: { provisioningStatus: "deleted" } });
    await prisma.desiredResource.update({ where: { id: resource.id }, data: { status: "rolled_back" } });
    deleted.push(resource.logicalName);
  }

  await prisma.deployment.update({ where: { id: deploymentId }, data: { status: "rolled_back" } });
  log.info({ deploymentId, deleted, requiresManualReview }, "Rollback completed");
  return { deleted, requiresManualReview };
}
