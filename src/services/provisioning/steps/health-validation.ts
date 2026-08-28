import { prisma } from "@/db/prisma";
import { childLogger } from "@/lib/logger";
import type { StepExecutionContext, StepExecutor, StepResult } from "../step-executor";

const log = childLogger({ module: "provisioning.step.health-validation" });

/** `ActualResourceProvisioningStatus` values considered healthy enough to
 * proceed to Access Configuration / Welcome Email. `degraded`/`failed`/
 * `deleted` are not — see prisma/schema/configuration.prisma. */
const HEALTHY_ACTUAL_STATUSES = new Set(["active", "provisioning"]);

/**
 * Fixed step that is the explicit, auditable health checkpoint between
 * resource creation and customer-facing steps (Access Configuration,
 * Welcome Email — see register-steps.ts for the full ordering rationale).
 *
 * By the time fixed steps run, `engine.ts`'s `runDeployment` has already
 * refused to reach this step if any resource-creation step failed
 * (`hasFailure` short-circuits before fixed steps even start). So under
 * normal operation this step should always pass. It exists anyway because:
 *   1. It is the auditable record ("we checked, and it was healthy") the
 *      brief requires before granting access or emailing a customer.
 *   2. It catches drift the engine's own bookkeeping cannot see — a
 *      DesiredResource that "succeeded" at creation time but whose
 *      ActualResource was later externally marked `degraded`/`failed`
 *      (e.g. by an admin action or a future reconciliation job), or a
 *      Lakehouse's SQL Analytics Endpoint that finished provisioning as
 *      `Failed` after resolve_sql_endpoint already ran once and moved on.
 *
 * Never mutates state — read-only validation. A failure here returns
 * `{ outcome: "failed" }` (not `NonRetryableStepError`): the underlying
 * condition (a resource still `provisioning`, a transient status flip)
 * may resolve on its own, so this should be retried rather than treated
 * as permanently unrecoverable.
 */
export const healthValidationStep: StepExecutor = {
  stepKey: "health_validation",
  name: "Validate deployment health",

  async execute({ deployment }: StepExecutionContext): Promise<StepResult> {
    const desiredResources = await prisma.desiredResource.findMany({
      where: { deploymentId: deployment.id },
      include: { actualResource: true },
    });

    const problems: string[] = [];

    for (const resource of desiredResources) {
      // A `skipped` resource (blocked by a failed dependency) is already
      // accounted for by the engine having marked the deployment
      // `hasFailure` — it is not itself a health problem to re-report here.
      if (resource.status === "skipped") continue;

      if (resource.status !== "succeeded") {
        problems.push(`Resource "${resource.logicalName}" has status "${resource.status}", expected "succeeded"`);
        continue;
      }

      if (!resource.actualResource) {
        problems.push(`Resource "${resource.logicalName}" succeeded but has no associated ActualResource`);
        continue;
      }

      if (!HEALTHY_ACTUAL_STATUSES.has(resource.actualResource.provisioningStatus)) {
        problems.push(
          `Resource "${resource.logicalName}" has ActualResource provisioningStatus "${resource.actualResource.provisioningStatus}"`,
        );
      }
    }

    // Correlate SqlEndpoint rows to Lakehouses created in this deployment
    // the same way resolve-sql-endpoint.ts does: a Lakehouse's
    // ActualResource.fabricItemId is the same id SqlEndpoint.fabricLakehouseId
    // is keyed on once the endpoint resolves.
    const lakehouseFabricItemIds = desiredResources
      .map((r) => r.actualResource)
      .filter((actual): actual is NonNullable<typeof actual> => actual !== null && actual.fabricItemType === "Lakehouse")
      .map((actual) => actual.fabricItemId);

    if (lakehouseFabricItemIds.length > 0) {
      const sqlEndpoints = await prisma.sqlEndpoint.findMany({
        where: { customerId: deployment.customerId, fabricLakehouseId: { in: lakehouseFabricItemIds } },
      });
      for (const endpoint of sqlEndpoints) {
        if (endpoint.provisioningStatus === "Failed") {
          problems.push(`SQL analytics endpoint for Lakehouse "${endpoint.fabricLakehouseId}" has provisioningStatus "Failed"`);
        }
      }
    }

    if (problems.length > 0) {
      log.warn({ deploymentId: deployment.id, problems }, "Health validation failed");
      return {
        outcome: "failed",
        errorCode: "HEALTH_CHECK_FAILED",
        errorMessage: `Deployment health validation failed: ${problems.join("; ")}`,
      };
    }

    log.info({ deploymentId: deployment.id, resourceCount: desiredResources.length }, "Health validation passed");
    return { outcome: "succeeded" };
  },
};
