import type { StepExecutor } from "./step-executor";
import { createFabricItemStep } from "./steps/create-fabric-item";
import { createWorkspaceStep } from "./steps/create-workspace";

/** Resource types that need a dedicated executor instead of the generic
 * create-fabric-item step, because their API shape is genuinely different
 * (workspace creation is `POST /v1/workspaces`, not
 * `POST /v1/workspaces/{id}/items`). Everything else goes through the
 * generic item-creation step driven by the Capability Registry. */
const resourceStepOverrides: Record<string, StepExecutor> = {
  Workspace: createWorkspaceStep,
};

/**
 * Fixed (non-resource) steps that run once per deployment, after all
 * DesiredResources have been created, in this order. Each phase of the
 * build registers its own executor here (permissions, SQL endpoint
 * resolution, initial load, monitoring, welcome email, ...) — the engine
 * itself never hardcodes what those steps do, only that they run after
 * resource creation and before the deployment is marked succeeded.
 *
 * Populated by services/provisioning/register-steps.ts, which every
 * feature module's step lives in, so this file stays a stable interface.
 */
const fixedSteps: StepExecutor[] = [];

export function registerFixedStep(step: StepExecutor): void {
  if (fixedSteps.some((s) => s.stepKey === step.stepKey)) return;
  fixedSteps.push(step);
}

export function getFixedSteps(): StepExecutor[] {
  return fixedSteps;
}

export function getResourceStepExecutor(resourceType: string): StepExecutor {
  return resourceStepOverrides[resourceType] ?? createFabricItemStep;
}
