import { randomUUID } from "node:crypto";
import { prisma } from "@/db/prisma";
import { childLogger } from "@/lib/logger";
import { redactForPersistence } from "@/lib/redact";
import { assertDeploymentReadyToStart } from "./preflight";
import { topologicalSort } from "./dag";
import { getFixedSteps, getResourceStepExecutor } from "./step-registry";
import { NonRetryableStepError, type StepExecutor } from "./step-executor";
import { FabricApiException } from "@/services/fabric";
import type { Prisma } from "@/generated/prisma/client";

const log = childLogger({ module: "provisioning.engine" });

const MAX_STEP_ATTEMPTS = 3;

/**
 * The provisioning job runner. Backed by Postgres today (DeploymentStep
 * rows are the durable state); this function is intentionally the only
 * place that knows *how* a deployment executes, so swapping the execution
 * backend (Temporal, Trigger.dev, ...) later means replacing what calls
 * `runDeployment`, not the step definitions or domain model themselves.
 *
 * Resumable: re-invoking this for a deployment that already has step rows
 * skips everything already `succeeded`/`skipped` and only (re)runs what
 * isn't done yet — this is what makes retry/resume (section 29) work
 * without restarting from step 1.
 */
export async function runDeployment(deploymentId: string): Promise<void> {
  await assertDeploymentReadyToStart(deploymentId);

  const deployment = await prisma.deployment.findUniqueOrThrow({
    where: { id: deploymentId },
    include: { desiredResources: true },
  });

  if (deployment.status === "draft" || deployment.status === "pending") {
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: "running", startedAt: deployment.startedAt ?? new Date() },
    });
  }

  const order = topologicalSort(
    deployment.desiredResources.map((r) => ({ logicalName: r.logicalName, dependsOn: r.dependsOn })),
  );
  const byLogicalName = new Map(deployment.desiredResources.map((r) => [r.logicalName, r]));

  let sequence = 0;
  let hasFailure = false;
  const blockedLogicalNames = new Set<string>();

  for (const logicalName of order) {
    sequence += 1;
    const resource = byLogicalName.get(logicalName)!;

    if (resource.dependsOn.some((dep) => blockedLogicalNames.has(dep))) {
      blockedLogicalNames.add(logicalName);
      await markDesiredResourceSkipped(resource.id, "A dependency failed to provision");
      continue;
    }

    const executor = getResourceStepExecutor(resource.type);
    const ok = await runStep({
      deploymentId,
      stepKey: `resource_${logicalName}`,
      name: `Create ${resource.displayName}`,
      sequence,
      executor,
      desiredResourceId: resource.id,
    });

    if (!ok) {
      hasFailure = true;
      blockedLogicalNames.add(logicalName);
    }
  }

  if (!hasFailure) {
    for (const step of getFixedSteps()) {
      sequence += 1;
      const ok = await runStep({ deploymentId, stepKey: step.stepKey, name: step.name, sequence, executor: step });
      if (!ok) {
        hasFailure = true;
        break; // fixed steps run in sequence; a failure here blocks the rest
      }
    }
  }

  await prisma.deployment.update({
    where: { id: deploymentId },
    data: {
      status: hasFailure ? "partially_failed" : "succeeded",
      finishedAt: new Date(),
    },
  });

  log.info({ deploymentId, hasFailure }, "Deployment run finished");
}

async function runStep(params: {
  deploymentId: string;
  stepKey: string;
  name: string;
  sequence: number;
  executor: StepExecutor;
  desiredResourceId?: string;
}): Promise<boolean> {
  const { deploymentId, stepKey, name, sequence, executor, desiredResourceId } = params;

  const existingStep = await prisma.deploymentStep.findUnique({
    where: { deploymentId_stepKey: { deploymentId, stepKey } },
  });

  if (existingStep?.status === "succeeded" || existingStep?.status === "skipped") {
    return true; // idempotent resume: already done
  }

  if (existingStep && existingStep.attempt >= MAX_STEP_ATTEMPTS) {
    log.error({ deploymentId, stepKey }, "Step exceeded max retry attempts");
    return false;
  }

  const attempt = (existingStep?.attempt ?? 0) + 1;
  const correlationId = randomUUID();

  const step = await prisma.deploymentStep.upsert({
    where: { deploymentId_stepKey: { deploymentId, stepKey } },
    create: {
      deploymentId,
      desiredResourceId,
      stepKey,
      name,
      sequence,
      status: "running",
      attempt,
      startedAt: new Date(),
    },
    update: { status: "running", attempt, startedAt: new Date(), errorCode: null, errorMessage: null },
  });

  if (desiredResourceId) {
    await prisma.desiredResource.update({ where: { id: desiredResourceId }, data: { status: "running" } });
  }

  try {
    const deployment = await prisma.deployment.findUniqueOrThrow({ where: { id: deploymentId } });
    const desiredResource = desiredResourceId
      ? await prisma.desiredResource.findUniqueOrThrow({ where: { id: desiredResourceId } })
      : undefined;

    const result = await executor.execute({ deployment, desiredResource, correlationId });

    await prisma.deploymentStep.update({
      where: { id: step.id },
      data: {
        status: result.outcome === "failed" ? "failed" : "succeeded",
        finishedAt: new Date(),
        resourceId: result.resourceId,
        requestMetadata: (result.requestMetadata ?? undefined) as Prisma.InputJsonValue | undefined,
        responseMetadata: (result.responseMetadata ?? undefined) as Prisma.InputJsonValue | undefined,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      },
    });

    if (desiredResourceId) {
      await prisma.desiredResource.update({
        where: { id: desiredResourceId },
        data: {
          status: result.outcome === "failed" ? "failed" : "succeeded",
          actualResourceId: result.resourceId,
        },
      });
    }

    return result.outcome !== "failed";
  } catch (error) {
    const isNonRetryable = error instanceof NonRetryableStepError;
    const message = error instanceof Error ? error.message : "Unknown error";
    const errorCode = isNonRetryable
      ? error.errorCode
      : error instanceof FabricApiException
        ? (error.errorCode ?? String(error.status))
        : "UNEXPECTED_ERROR";

    await prisma.deploymentStep.update({
      where: { id: step.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorCode,
        errorMessage: message,
        responseMetadata: redactForPersistence({ stack: error instanceof Error ? error.stack : undefined }) as Prisma.InputJsonValue,
      },
    });

    if (desiredResourceId) {
      await prisma.desiredResource.update({ where: { id: desiredResourceId }, data: { status: "failed" } });
    }

    log.error({ deploymentId, stepKey, errorCode, message }, "Provisioning step failed");
    return false;
  }
}

async function markDesiredResourceSkipped(desiredResourceId: string, reason: string): Promise<void> {
  await prisma.desiredResource.update({ where: { id: desiredResourceId }, data: { status: "skipped" } });
  log.warn({ desiredResourceId, reason }, "Resource skipped due to blocked dependency");
}

/** Cancel a running/pending deployment. Does not roll back already-created
 * resources unless the deployment's rollbackPolicy says to (section 31) —
 * that reconciliation runs separately, see services/provisioning/rollback.ts. */
export async function cancelDeployment(deploymentId: string): Promise<void> {
  await prisma.deployment.update({ where: { id: deploymentId }, data: { status: "cancelled", finishedAt: new Date() } });
}
