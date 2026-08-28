import "server-only";
import { prisma } from "@/db/prisma";
import { ForbiddenError } from "@/lib/authz";
import { requireCustomerAccess } from "@/lib/require-customer-access";
import { childLogger } from "@/lib/logger";
import { isAppointmentGateSkipped } from "@/lib/env";
import { writeAuditLog } from "@/lib/audit-log";
import { generateDeploymentPlan, createDeploymentFromPlan, type DeploymentPlan } from "@/services/provisioning/planner";
import { assertDeploymentReadyToStart } from "@/services/provisioning/preflight";
import { runDeployment, cancelDeployment as cancelDeploymentJob } from "@/services/provisioning/engine";
import { getRollbackSafety, rollbackDeployment as rollbackDeploymentJob } from "@/services/provisioning/rollback";
import type {
  InfrastructureConfiguration,
  Deployment,
  Prisma,
} from "@/generated/prisma/client";
import {
  createConfigurationInput,
  updateConfigurationInput,
  createDeploymentInput,
  type CreateConfigurationDraft,
  type UpdateConfigurationDraft,
  type CreateDeploymentDraft,
} from "./schemas";

const log = childLogger({ module: "provisioning.service" });

/** Every function here is a privileged/customer-scoped server action per
 * the pattern established in src/features/customers/service.ts and
 * src/features/appointments/service.ts — route handlers under
 * src/app/api/{customers,configurations,deployments,portal} are thin
 * wrappers around these, never re-implementing the authz/validation. */

// ---- Draft resource-parameter-overrides workaround -----------------------

/**
 * Reserved `ConfigurationVersion.version` used to persist wizard-collected,
 * per-resource parameter overrides ahead of finalization.
 *
 * WHY THIS EXISTS: `InfrastructureConfiguration`
 * (prisma/schema/configuration.prisma) has no column for per-resource
 * parameter overrides — only `ConfigurationVersion.snapshotJson`, which
 * captures a full point-in-time snapshot, and real versions are only ever
 * created by `finalizeConfiguration()` starting at version 1. Adding a
 * proper column/table for in-progress draft overrides would mean editing
 * `prisma/schema/**`, which is out of scope for this task (see the task
 * brief's hard constraints). Reusing version `0` — a value the real
 * versioning sequence (1, 2, 3, ...) never produces — as a dedicated
 * draft-storage slot lets the wizard's Fabric Resources step save/reload
 * its in-progress parameter values across page loads without a schema
 * change. This row is NEVER treated as a real version: finalizeConfiguration
 * reads it for its *values* but writes its own separate version row at
 * `currentVersion`, and never overwrites or deletes the version-0 row (so a
 * customer can keep drafting further changes after finalizing).
 */
const DRAFT_OVERRIDES_VERSION = 0;

type ResourceParameterOverrides = Record<string, Record<string, unknown>>;

/** Upserts the version-0 draft-overrides row. See DRAFT_OVERRIDES_VERSION's
 * doc comment above for why this workaround exists. Private — callers only
 * ever go through updateConfiguration(). */
async function upsertDraftOverrides(
  infrastructureConfigurationId: string,
  resourceParameterOverrides: ResourceParameterOverrides,
): Promise<void> {
  await prisma.configurationVersion.upsert({
    where: {
      infrastructureConfigurationId_version: {
        infrastructureConfigurationId,
        version: DRAFT_OVERRIDES_VERSION,
      },
    },
    create: {
      infrastructureConfigurationId,
      version: DRAFT_OVERRIDES_VERSION,
      snapshotJson: { resourceParameterOverrides } as Prisma.InputJsonValue,
      changeSummary: "draft resource parameter overrides",
    },
    update: {
      snapshotJson: { resourceParameterOverrides } as Prisma.InputJsonValue,
      changeSummary: "draft resource parameter overrides",
    },
  });
}

/** Reads back the version-0 draft row written by `upsertDraftOverrides`,
 * defaulting to `{}` if the customer hasn't saved any per-resource
 * overrides yet. Private — used by generateConfigurationPlan(),
 * finalizeConfiguration(), and createDeployment(). */
async function getDraftResourceParameterOverrides(
  infrastructureConfigurationId: string,
): Promise<ResourceParameterOverrides> {
  const draft = await prisma.configurationVersion.findUnique({
    where: {
      infrastructureConfigurationId_version: {
        infrastructureConfigurationId,
        version: DRAFT_OVERRIDES_VERSION,
      },
    },
  });
  if (!draft) return {};
  const snapshot = draft.snapshotJson as { resourceParameterOverrides?: ResourceParameterOverrides } | null;
  return snapshot?.resourceParameterOverrides ?? {};
}

// ---- InfrastructureConfiguration CRUD ------------------------------------

export async function createConfiguration(
  customerId: string,
  draft: CreateConfigurationDraft,
): Promise<InfrastructureConfiguration> {
  const ctx = await requireCustomerAccess(customerId);
  const input = createConfigurationInput.parse(draft);

  const configuration = await prisma.infrastructureConfiguration.create({
    data: {
      customerId,
      blueprintId: input.blueprintId,
      name: input.name,
      environmentMode: input.environmentMode,
      architecture: input.architecture,
      namingConventionTemplate: input.namingConventionTemplate,
      sqlSelfServiceEnabled: input.sqlSelfServiceEnabled,
      sqlSelfServiceTargetLayer: input.sqlSelfServiceTargetLayer,
      semanticModelEnabled: input.semanticModelEnabled,
      starterReportEnabled: input.starterReportEnabled,
      usageReportEnabled: input.usageReportEnabled,
      usageReportOptionsJson: input.usageReportOptionsJson as Prisma.InputJsonValue | undefined,
      operationalAlertsEnabled: input.operationalAlertsEnabled,
      status: "draft",
      currentVersion: 1,
      createdById: ctx.userId,
    },
  });

  await writeAuditLog({
    userId: ctx.userId,
    customerId,
    action: "configuration.create",
    resourceType: "InfrastructureConfiguration",
    resourceId: configuration.id,
    metadata: { name: input.name, blueprintId: input.blueprintId },
  });
  log.info({ configurationId: configuration.id, customerId }, "Infrastructure configuration created");
  return configuration;
}

export async function listConfigurationsForCustomer(customerId: string): Promise<InfrastructureConfiguration[]> {
  await requireCustomerAccess(customerId);
  return prisma.infrastructureConfiguration.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } });
}

/** Fetch-then-authorize, matching the pattern already used by
 * appointments/service.ts's confirmAppointment/cancelAppointment: the
 * configuration id is the only input, so its owning customerId has to be
 * read from the row itself before requireCustomerAccess can run. */
export async function getConfiguration(id: string) {
  const configuration = await prisma.infrastructureConfiguration.findUniqueOrThrow({
    where: { id },
    include: { blueprint: { include: { resources: { orderBy: { sortOrder: "asc" } } } } },
  });
  await requireCustomerAccess(configuration.customerId);
  return configuration;
}

export async function updateConfiguration(
  id: string,
  draft: UpdateConfigurationDraft,
): Promise<InfrastructureConfiguration> {
  const existing = await prisma.infrastructureConfiguration.findUniqueOrThrow({ where: { id } });
  const ctx = await requireCustomerAccess(existing.customerId);
  const input = updateConfigurationInput.parse(draft);
  const { resourceParameterOverrides, usageReportOptionsJson, ...rest } = input;

  const configuration = await prisma.infrastructureConfiguration.update({
    where: { id },
    data: {
      ...rest,
      ...(usageReportOptionsJson !== undefined
        ? { usageReportOptionsJson: usageReportOptionsJson as Prisma.InputJsonValue }
        : {}),
    },
  });

  if (resourceParameterOverrides) {
    await upsertDraftOverrides(id, resourceParameterOverrides);
  }

  await writeAuditLog({
    userId: ctx.userId,
    customerId: existing.customerId,
    action: "configuration.update",
    resourceType: "InfrastructureConfiguration",
    resourceId: id,
    metadata: { fields: Object.keys(input) },
  });
  log.info({ configurationId: id }, "Infrastructure configuration updated");
  return configuration;
}

/**
 * Locks in the current draft as `finalized`: creates the REAL
 * ConfigurationVersion row at `currentVersion` (full snapshot: config
 * fields + blueprint resources + the merged overrides from the version-0
 * draft row) and increments `currentVersion`. The version-0 draft row is
 * left in place untouched — see DRAFT_OVERRIDES_VERSION's doc comment.
 */
export async function finalizeConfiguration(id: string): Promise<InfrastructureConfiguration> {
  const existing = await prisma.infrastructureConfiguration.findUniqueOrThrow({
    where: { id },
    include: { blueprint: { include: { resources: true } } },
  });
  const ctx = await requireCustomerAccess(existing.customerId);
  const resourceParameterOverrides = await getDraftResourceParameterOverrides(id);

  const snapshotJson = {
    configuration: {
      name: existing.name,
      environmentMode: existing.environmentMode,
      architecture: existing.architecture,
      namingConventionTemplate: existing.namingConventionTemplate,
      sqlSelfServiceEnabled: existing.sqlSelfServiceEnabled,
      sqlSelfServiceTargetLayer: existing.sqlSelfServiceTargetLayer,
      semanticModelEnabled: existing.semanticModelEnabled,
      starterReportEnabled: existing.starterReportEnabled,
      usageReportEnabled: existing.usageReportEnabled,
      usageReportOptionsJson: existing.usageReportOptionsJson,
      operationalAlertsEnabled: existing.operationalAlertsEnabled,
    },
    blueprintResources: existing.blueprint?.resources ?? [],
    resourceParameterOverrides,
  } as unknown as Prisma.InputJsonValue;

  const [configuration] = await prisma.$transaction([
    prisma.infrastructureConfiguration.update({
      where: { id },
      data: { status: "finalized", currentVersion: { increment: 1 } },
    }),
    prisma.configurationVersion.create({
      data: {
        infrastructureConfigurationId: id,
        version: existing.currentVersion,
        snapshotJson,
        changeSummary: "Configuration finalized",
        createdById: ctx.userId,
      },
    }),
  ]);

  await writeAuditLog({
    userId: ctx.userId,
    customerId: existing.customerId,
    action: "configuration.finalize",
    resourceType: "InfrastructureConfiguration",
    resourceId: id,
    metadata: { version: existing.currentVersion },
  });
  log.info({ configurationId: id, version: existing.currentVersion }, "Infrastructure configuration finalized");
  return configuration;
}

/** Loads the version-0 draft overrides and turns the configuration into a
 * concrete plan via services/provisioning/planner.ts's pure planning logic
 * — no Fabric calls, no persistence, just the "Terraform-like plan"
 * preview shown in the wizard's Review step. */
export async function generateConfigurationPlan(id: string): Promise<DeploymentPlan> {
  const existing = await prisma.infrastructureConfiguration.findUniqueOrThrow({ where: { id } });
  await requireCustomerAccess(existing.customerId);
  const overrides = await getDraftResourceParameterOverrides(id);
  return generateDeploymentPlan(id, overrides);
}

// ---- Deployments ----------------------------------------------------------

type DeploymentWithResources = Prisma.DeploymentGetPayload<{ include: { desiredResources: true } }>;

/**
 * Creates a Deployment from a finalized/draft configuration's plan.
 * SECURITY-CRITICAL: this is the one function standing between "an
 * authenticated user hit an API route" and "infrastructure provisioning
 * gets queued for a customer". It independently re-derives every fact it
 * relies on from the database — never trusting client input beyond opaque
 * ids — mirroring (and running strictly before) the identical appointment
 * re-check inside assertDeploymentReadyToStart()/runDeployment() (see
 * docs/ARCHITECTURE.md's "mandatory appointment gate"). Two independent
 * enforcement points for the same invariant is intentional defense in
 * depth, not redundancy to be trimmed.
 *
 * Deliberately does NOT accept a `customerId` parameter (a departure from
 * the literal shape sketched in the task brief): createDeploymentInput has
 * no customerId field (see its doc comment in ./schemas.ts) specifically
 * so a client can never supply — or a caller accidentally mismatch — which
 * customer a deployment belongs to. The owning customer is instead
 * resolved here, once, straight from the InfrastructureConfiguration row,
 * and every subsequent check (the appointment's ownership, the
 * `requireCustomerAccess` authorization) is verified against that single
 * resolved value.
 */
export async function createDeployment(
  draft: CreateDeploymentDraft & { createdById: string },
): Promise<DeploymentWithResources> {
  const { createdById, ...rest } = draft;
  const input = createDeploymentInput.parse(rest);

  const configuration = await prisma.infrastructureConfiguration.findUnique({
    where: { id: input.infrastructureConfigurationId },
  });
  if (!configuration) {
    throw new Error(`Infrastructure configuration "${input.infrastructureConfigurationId}" was not found`);
  }
  const customerId = configuration.customerId;

  // Authorizes the acting user against the resolved customer. Internal
  // staff always pass; a customer_admin/customer_user must have an active
  // membership for THIS customer — so a customer can never deploy against
  // a configuration they don't own, even if they guess its id.
  await requireCustomerAccess(customerId);

  // --- The mandatory appointment gate, re-derived from the DB ---
  const appointment = await prisma.appointment.findUnique({ where: { id: input.appointmentId } });
  if (!appointment) {
    throw new Error(`Appointment "${input.appointmentId}" was not found`);
  }
  if (appointment.customerId !== customerId) {
    throw new ForbiddenError("This appointment does not belong to the configuration's customer");
  }
  if (appointment.status !== "confirmed" && !isAppointmentGateSkipped()) {
    throw new Error(
      `Appointment "${input.appointmentId}" is not confirmed (status: "${appointment.status}"). ` +
        "A confirmed service appointment is required before infrastructure can be deployed.",
    );
  }

  const resourceParameterOverrides = await getDraftResourceParameterOverrides(input.infrastructureConfigurationId);

  const created = await createDeploymentFromPlan({
    customerId,
    infrastructureConfigurationId: input.infrastructureConfigurationId,
    appointmentId: input.appointmentId,
    createdById,
    resourceParameterOverrides,
  });

  // createDeploymentFromPlan() has no rollbackPolicy parameter (it's
  // outside the DAG/planning concern it owns), so the requested policy —
  // defaulted to KEEP_SUCCESSFUL_RESOURCES by createDeploymentInput, same
  // as the Deployment model's own column default — is only applied with a
  // follow-up update when the caller asked for something else.
  const deployment: DeploymentWithResources =
    input.rollbackPolicy === "KEEP_SUCCESSFUL_RESOURCES"
      ? created
      : await prisma.deployment.update({
          where: { id: created.id },
          data: { rollbackPolicy: input.rollbackPolicy },
          include: { desiredResources: true },
        });

  await writeAuditLog({
    userId: createdById,
    customerId,
    deploymentId: deployment.id,
    action: "deployment.create",
    resourceType: "Deployment",
    resourceId: deployment.id,
    metadata: {
      infrastructureConfigurationId: input.infrastructureConfigurationId,
      appointmentId: input.appointmentId,
      rollbackPolicy: input.rollbackPolicy,
    },
  });
  log.info({ deploymentId: deployment.id, customerId }, "Deployment created");
  return deployment;
}

/** Runs preflight, then fires the (potentially long-running) provisioning
 * job WITHOUT awaiting it — this must never block an HTTP response on a
 * deployment that can take minutes. The rejection is always caught so a
 * failed run can never surface as an unhandled promise rejection; the
 * failure itself is still fully recorded (Deployment.status,
 * DeploymentStep rows) by runDeployment() itself. */
export async function startDeployment(id: string): Promise<void> {
  const deployment = await prisma.deployment.findUniqueOrThrow({ where: { id } });
  const ctx = await requireCustomerAccess(deployment.customerId);

  await assertDeploymentReadyToStart(id);

  void runDeployment(id).catch((err: unknown) => {
    log.error({ err, deploymentId: id }, "Deployment run failed asynchronously");
  });

  await writeAuditLog({
    userId: ctx.userId,
    customerId: deployment.customerId,
    deploymentId: id,
    action: "deployment.start",
  });
  log.info({ deploymentId: id }, "Deployment start requested");
}

export async function cancelDeployment(id: string): Promise<void> {
  const deployment = await prisma.deployment.findUniqueOrThrow({ where: { id } });
  const ctx = await requireCustomerAccess(deployment.customerId);

  await cancelDeploymentJob(id);

  await writeAuditLog({
    userId: ctx.userId,
    customerId: deployment.customerId,
    deploymentId: id,
    action: "deployment.cancel",
  });
  log.info({ deploymentId: id }, "Deployment cancelled");
}

/**
 * Runs an automatic rollback, but only when EVERY resource that would be
 * touched is rollback-safe (per services/provisioning/rollback.ts's
 * getRollbackSafety) — if any resource needs manual review, this throws
 * naming them rather than silently proceeding with a partial rollback the
 * caller didn't ask for. When the deployment's policy is
 * KEEP_SUCCESSFUL_RESOURCES, rollbackDeploymentJob() itself is always a
 * no-op, so the safety pre-check is skipped entirely (nothing would ever
 * be deleted, so there's nothing to refuse).
 */
export async function rollbackDeployment(
  id: string,
): Promise<{ deleted: string[]; requiresManualReview: string[] }> {
  const deployment = await prisma.deployment.findUniqueOrThrow({
    where: { id },
    include: { desiredResources: { include: { actualResource: true } } },
  });
  const ctx = await requireCustomerAccess(deployment.customerId);

  if (deployment.rollbackPolicy === "ROLLBACK_CREATED_RESOURCES") {
    const provisioned = deployment.desiredResources.filter((r) => r.actualResource);
    const safetyChecks = await Promise.all(
      provisioned.map(async (r) => ({ logicalName: r.logicalName, safety: await getRollbackSafety(r.type) })),
    );
    const unsafe = safetyChecks.filter(({ safety }) => !safety.rollbackSafe || safety.neverAutoDelete);
    if (unsafe.length > 0) {
      throw new Error(
        "Rollback is not safe to run automatically — the following resources require manual review: " +
          unsafe.map((u) => u.logicalName).join(", "),
      );
    }
  }

  const result = await rollbackDeploymentJob(id);

  await writeAuditLog({
    userId: ctx.userId,
    customerId: deployment.customerId,
    deploymentId: id,
    action: "deployment.rollback",
    metadata: result,
  });
  log.info({ deploymentId: id, ...result }, "Deployment rollback executed");
  return result;
}

export async function getDeployment(id: string) {
  const deployment = await prisma.deployment.findUniqueOrThrow({
    where: { id },
    include: {
      desiredResources: { include: { actualResource: true } },
      steps: { orderBy: { sequence: "asc" } },
    },
  });
  await requireCustomerAccess(deployment.customerId);
  return deployment;
}

export async function listDeploymentsForCustomer(customerId: string): Promise<Deployment[]> {
  await requireCustomerAccess(customerId);
  return prisma.deployment.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } });
}
