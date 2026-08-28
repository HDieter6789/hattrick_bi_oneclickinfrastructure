import type { Deployment, DesiredResource } from "@/generated/prisma/client";

/**
 * A step executor performs one unit of provisioning work. There is NOT one
 * executor per Fabric item type — `createFabricItemStep` (see
 * services/provisioning/steps/create-fabric-item.ts) handles every item
 * type generically via the Capability Registry + Parameter Engine.
 * Executors only get split out when the operation is genuinely distinct
 * (create workspace, assign permissions, resolve SQL endpoint, run
 * initial load, send welcome email, ...).
 *
 * Every executor MUST be idempotent: given the same DesiredResource, if an
 * ActualResource already exists and is healthy, `execute` returns
 * `{ outcome: "skipped" }` without calling Fabric again (brief section 30).
 */
export interface StepExecutionContext {
  deployment: Deployment;
  desiredResource?: DesiredResource;
  correlationId: string;
}

export type StepOutcome = "succeeded" | "skipped" | "failed";

export interface StepResult {
  outcome: StepOutcome;
  resourceId?: string;
  requestMetadata?: unknown;
  responseMetadata?: unknown;
  errorCode?: string;
  errorMessage?: string;
}

export interface StepExecutor {
  /** Stable key, persisted on DeploymentStep.stepKey. Never renamed once
   * shipped — retries/resume look steps up by this key. */
  readonly stepKey: string;
  readonly name: string;
  execute(context: StepExecutionContext): Promise<StepResult>;
}

/** Thrown by an executor to signal a genuinely unrecoverable condition
 * (e.g. capability not provisionable) that retrying will never fix —
 * distinct from a transient FabricApiException, which the engine retries. */
export class NonRetryableStepError extends Error {
  constructor(
    message: string,
    public readonly errorCode: string,
  ) {
    super(message);
    this.name = "NonRetryableStepError";
  }
}
