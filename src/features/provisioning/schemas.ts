import { z } from "zod";
import { ArchitecturePattern, CustomerEnvironmentMode, RollbackPolicy } from "@/generated/prisma/enums";

/** Mirrors prisma enums (prisma/schema/blueprint.prisma,
 * prisma/schema/customer.prisma, prisma/schema/provisioning.prisma). Plain
 * generated-enum objects, safe to import from client wizard code — same
 * convention as src/schemas/ingestion.ts. */
export const architecturePatternSchema = z.enum(ArchitecturePattern);
export const environmentModeSchema = z.enum(CustomerEnvironmentMode);
export const rollbackPolicySchema = z.enum(RollbackPolicy);

/**
 * InfrastructureConfiguration create/update input. Field set matches the
 * brief's spec 1:1 with the model in prisma/schema/configuration.prisma.
 *
 * `resourceParameterOverrides` (update only) is NOT a real column — see the
 * long comment on `upsertDraftOverrides` in ./service.ts for why: the model
 * has no field for per-resource parameter overrides ahead of finalization,
 * so the wizard's Fabric Resources step values are persisted into a
 * reserved `ConfigurationVersion` "version 0" draft row instead.
 */
export const createConfigurationInput = z.object({
  name: z.string().min(1).max(200),
  blueprintId: z.string().min(1).optional(),
  environmentMode: environmentModeSchema.default("single"),
  architecture: architecturePatternSchema.default("medallion"),
  namingConventionTemplate: z.string().min(1).max(500).optional(),
  sqlSelfServiceEnabled: z.boolean().default(false),
  sqlSelfServiceTargetLayer: z.string().min(1).max(50).optional(),
  semanticModelEnabled: z.boolean().default(false),
  starterReportEnabled: z.boolean().default(false),
  usageReportEnabled: z.boolean().default(false),
  usageReportOptionsJson: z.record(z.string(), z.boolean()).optional(),
  operationalAlertsEnabled: z.boolean().default(false),
});
export type CreateConfigurationInput = z.infer<typeof createConfigurationInput>;
export type CreateConfigurationDraft = z.input<typeof createConfigurationInput>;

export const updateConfigurationInput = z.object({
  name: z.string().min(1).max(200).optional(),
  blueprintId: z.string().min(1).nullable().optional(),
  environmentMode: environmentModeSchema.optional(),
  architecture: architecturePatternSchema.optional(),
  namingConventionTemplate: z.string().min(1).max(500).optional(),
  sqlSelfServiceEnabled: z.boolean().optional(),
  sqlSelfServiceTargetLayer: z.string().min(1).max(50).optional(),
  semanticModelEnabled: z.boolean().optional(),
  starterReportEnabled: z.boolean().optional(),
  usageReportEnabled: z.boolean().optional(),
  usageReportOptionsJson: z.record(z.string(), z.boolean()).optional(),
  operationalAlertsEnabled: z.boolean().optional(),
  /** logicalName -> parameter values, collected by the wizard's Fabric
   * Resources step. See the module doc comment above. */
  resourceParameterOverrides: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
});
export type UpdateConfigurationInput = z.infer<typeof updateConfigurationInput>;
export type UpdateConfigurationDraft = z.input<typeof updateConfigurationInput>;

/**
 * POST /api/deployments body. Deliberately does NOT accept `customerId`
 * from the caller — the deployment's customer is always derived server-side
 * from the InfrastructureConfiguration row, so a client can't spoof which
 * customer a deployment belongs to.
 */
export const createDeploymentInput = z.object({
  infrastructureConfigurationId: z.string().min(1),
  appointmentId: z.string().min(1),
  rollbackPolicy: rollbackPolicySchema.default("KEEP_SUCCESSFUL_RESOURCES"),
});
export type CreateDeploymentInput = z.infer<typeof createDeploymentInput>;
export type CreateDeploymentDraft = z.input<typeof createDeploymentInput>;
