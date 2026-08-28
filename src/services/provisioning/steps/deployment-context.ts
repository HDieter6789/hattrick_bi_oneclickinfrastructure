import { prisma } from "@/db/prisma";

/**
 * Resolves the target workspace's real Fabric id from the deployment's own
 * "workspace" DesiredResource, so fixed steps that need to call the Fabric
 * API against the deployment's workspace don't need it threaded through
 * separately. Mirrors the private helper of the same name in
 * steps/create-fabric-item.ts (kept local there since it only needs it for
 * one call site) — duplicated here, not imported from that file, since
 * create-fabric-item.ts doesn't export it and this repo's fixed steps
 * (run-initial-load, resolve-sql-endpoint) both need the same lookup.
 */
export async function resolveDeploymentWorkspaceId(deploymentId: string): Promise<string | undefined> {
  const workspaceResource = await prisma.desiredResource.findUnique({
    where: { deploymentId_logicalName: { deploymentId, logicalName: "workspace" } },
    include: { actualResource: true },
  });
  return workspaceResource?.actualResource?.fabricWorkspaceId;
}
