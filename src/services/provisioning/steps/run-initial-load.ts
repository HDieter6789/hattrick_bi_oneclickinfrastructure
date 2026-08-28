import { prisma } from "@/db/prisma";
import { getFabricApiClient, FabricApiException } from "@/services/fabric";
import { redactForPersistence } from "@/lib/redact";
import { childLogger } from "@/lib/logger";
import type { StepExecutionContext, StepExecutor, StepResult } from "../step-executor";
import { resolveDeploymentWorkspaceId } from "./deployment-context";
import type { IngestionConfiguration } from "@/generated/prisma/client";

const log = childLogger({ module: "provisioning.step.run-initial-load" });

interface IngestionRunOutcome {
  ingestionConfigurationId: string;
  sourceObject: string;
  outcome: "succeeded" | "failed" | "skipped";
  errorMessage?: string;
}

/**
 * Fixed step that triggers each of a deployment's `IngestionConfiguration`
 * rows' Copy Job execution and waits for the run to complete.
 *
 * Scope boundary (see brief): wiring an `IngestionConfiguration` to the
 * `DesiredResource`/`ActualResource` that represents its actual Fabric Copy
 * Job item is owned by a future planner integration, which is expected to
 * populate `IngestionConfiguration.fabricPipelineItemId` once that
 * DesiredResource is created. Until that wiring exists, a configuration
 * without a resolved `fabricPipelineItemId` is not actionable yet — this
 * step logs and skips it rather than failing the deployment, since "ingestion
 * configured but not yet wired into this blueprint" is a valid, non-error
 * state.
 *
 * Idempotent per configuration: a row whose `lastRunStatus` is already
 * "succeeded" is not re-run.
 */
export const runInitialLoadStep: StepExecutor = {
  stepKey: "run_initial_load",
  name: "Run initial data load",

  async execute({ deployment, correlationId }: StepExecutionContext): Promise<StepResult> {
    const configs = await prisma.ingestionConfiguration.findMany({
      where: { infrastructureConfigurationId: deployment.infrastructureConfigurationId },
    });

    if (configs.length === 0) {
      return { outcome: "skipped" };
    }

    const runnable = configs.filter((c) => c.fabricPipelineItemId);
    if (runnable.length === 0) {
      log.info(
        { deploymentId: deployment.id, configCount: configs.length },
        "No ingestion configuration has a resolved Fabric Copy Job item yet — skipping run_initial_load",
      );
      return { outcome: "skipped" };
    }

    const workspaceId = await resolveDeploymentWorkspaceId(deployment.id);
    if (!workspaceId) {
      // Genuinely unrecoverable for this deployment shape: without a
      // workspace resource there is nowhere to run a job against, and
      // retrying will not create one.
      return {
        outcome: "failed",
        errorCode: "MISSING_WORKSPACE",
        errorMessage: "No workspace resource was found for this deployment",
      };
    }

    const client = getFabricApiClient();
    const outcomes: IngestionRunOutcome[] = [];
    let anyFailed = false;

    for (const config of configs) {
      if (!config.fabricPipelineItemId) {
        outcomes.push({ ingestionConfigurationId: config.id, sourceObject: config.sourceObject, outcome: "skipped" });
        continue;
      }

      if (config.lastRunStatus === "succeeded") {
        log.info({ ingestionConfigurationId: config.id }, "Initial load already succeeded — skipping");
        outcomes.push({ ingestionConfigurationId: config.id, sourceObject: config.sourceObject, outcome: "skipped" });
        continue;
      }

      const result = await runOneIngestion(client, workspaceId, config, correlationId);
      outcomes.push(result);
      if (result.outcome === "failed") anyFailed = true;
    }

    const requestMetadata = redactForPersistence({ workspaceId, configCount: configs.length });
    const responseMetadata = redactForPersistence({ outcomes });

    if (anyFailed) {
      return {
        outcome: "failed",
        errorCode: "INITIAL_LOAD_FAILED",
        errorMessage: "One or more ingestion configurations failed their initial load",
        requestMetadata,
        responseMetadata,
      };
    }

    const ranAtLeastOne = outcomes.some((o) => o.outcome === "succeeded");
    return {
      outcome: ranAtLeastOne ? "succeeded" : "skipped",
      requestMetadata,
      responseMetadata,
    };
  },
};

async function runOneIngestion(
  client: ReturnType<typeof getFabricApiClient>,
  workspaceId: string,
  config: IngestionConfiguration,
  correlationId: string,
): Promise<IngestionRunOutcome> {
  const itemId = config.fabricPipelineItemId!;
  try {
    const response = await client.post<unknown>(
      `/workspaces/${workspaceId}/items/${itemId}/jobs/instances`,
      {},
      { correlationId, query: { jobType: "CopyJob" } },
    );

    const succeeded = response.status === "Succeeded";
    await prisma.ingestionConfiguration.update({
      where: { id: config.id },
      data: { lastRunAt: new Date(), lastRunStatus: succeeded ? "succeeded" : "failed" },
    });

    if (!succeeded) {
      return {
        ingestionConfigurationId: config.id,
        sourceObject: config.sourceObject,
        outcome: "failed",
        errorMessage: response.error?.message ?? "Copy Job run did not succeed",
      };
    }

    return { ingestionConfigurationId: config.id, sourceObject: config.sourceObject, outcome: "succeeded" };
  } catch (error) {
    const message = error instanceof FabricApiException ? error.message : error instanceof Error ? error.message : "Unknown error";
    await prisma.ingestionConfiguration.update({
      where: { id: config.id },
      data: { lastRunAt: new Date(), lastRunStatus: "failed" },
    });
    log.error({ ingestionConfigurationId: config.id, error: message }, "Initial load run failed");
    return { ingestionConfigurationId: config.id, sourceObject: config.sourceObject, outcome: "failed", errorMessage: message };
  }
}
