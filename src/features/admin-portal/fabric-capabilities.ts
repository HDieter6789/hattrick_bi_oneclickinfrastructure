import "server-only";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { requireRole } from "@/lib/authz";
import { childLogger } from "@/lib/logger";
import {
  fabricCapabilityCategorySchema,
  fabricParameterSchemaInput,
  registerFabricCapabilityInput,
  type RegisterFabricCapabilityDraft,
} from "@/schemas/fabric-capability";

export type { RegisterFabricCapabilityDraft } from "@/schemas/fabric-capability";
import { fabricCapabilityRegistry, type CapabilityWithParameters } from "@/services/fabric/capability-registry";
import { Prisma } from "@/generated/prisma/client";
import type { FabricParameterSchema } from "@/generated/prisma/client";

const log = childLogger({ module: "admin.fabric-capabilities" });

/**
 * Admin-only surface over FabricCapability/FabricParameterSchema. Reuses
 * `FabricCapabilityRegistryService` (src/services/fabric/capability-registry.ts)
 * for anything it already does correctly (registration/upsert validation);
 * adds only what that service doesn't expose — full-field editing by id,
 * and per-parameter-row CRUD, both scoped to what the admin editor needs.
 */

// ---- List / detail (read) ----------------------------------------------

export const listAdminFabricCapabilitiesQuery = z.object({
  category: fabricCapabilityCategorySchema.optional(),
  enabledOnly: z.boolean().default(false),
});
export type ListAdminFabricCapabilitiesDraft = z.input<typeof listAdminFabricCapabilitiesQuery>;

export async function listAdminFabricCapabilities(draft: ListAdminFabricCapabilitiesDraft = {}): Promise<CapabilityWithParameters[]> {
  await requireRole("platform_admin", "operations", "service_agent");
  const input = listAdminFabricCapabilitiesQuery.parse(draft);
  return fabricCapabilityRegistry.getCapabilities({ enabledOnly: input.enabledOnly || undefined, category: input.category });
}

export async function getAdminFabricCapability(id: string): Promise<CapabilityWithParameters | null> {
  await requireRole("platform_admin", "operations", "service_agent");
  return prisma.fabricCapability.findUnique({
    where: { id },
    include: { parameterSchemas: { orderBy: { sortOrder: "asc" } } },
  });
}

// ---- Create (delegates to the canonical registry service) -------------

export async function createAdminFabricCapability(draft: RegisterFabricCapabilityDraft): Promise<CapabilityWithParameters> {
  await requireRole("platform_admin", "operations");
  const capability = await fabricCapabilityRegistry.registerCapability(draft);
  log.info({ itemType: capability.itemType }, "Admin created/updated fabric capability via registry");
  return capability;
}

// ---- Update full field set by id (registry's updateCapability() only --
// ---- patches 4 fields by itemType, not enough for the admin editor) ----

export const updateAdminFabricCapabilityInput = registerFabricCapabilityInput
  .omit({ itemType: true, parameters: true })
  .partial();
export type UpdateAdminFabricCapabilityInput = z.infer<typeof updateAdminFabricCapabilityInput>;
export type UpdateAdminFabricCapabilityDraft = z.input<typeof updateAdminFabricCapabilityInput>;

export async function updateAdminFabricCapability(id: string, draft: UpdateAdminFabricCapabilityDraft): Promise<CapabilityWithParameters> {
  await requireRole("platform_admin", "operations");
  const input = updateAdminFabricCapabilityInput.parse(draft);
  const capability = await prisma.fabricCapability.update({
    where: { id },
    data: input,
    include: { parameterSchemas: { orderBy: { sortOrder: "asc" } } },
  });
  log.info({ id, itemType: capability.itemType }, "Admin updated fabric capability");
  return capability;
}

// ---- Parameter schema row CRUD -----------------------------------------

export const addAdminParameterSchemaInput = fabricParameterSchemaInput;
export type AddAdminParameterSchemaDraft = z.input<typeof addAdminParameterSchemaInput>;

export async function addAdminParameterSchema(capabilityId: string, draft: AddAdminParameterSchemaDraft): Promise<FabricParameterSchema> {
  await requireRole("platform_admin", "operations");
  const input = addAdminParameterSchemaInput.parse(draft);
  const row = await prisma.fabricParameterSchema.create({
    data: {
      fabricCapabilityId: capabilityId,
      key: input.key,
      label: input.label,
      description: input.description,
      inputType: input.inputType,
      mode: input.mode,
      required: input.required,
      defaultValue: input.defaultValue ?? undefined,
      optionsJson: input.options ?? undefined,
      validationJson: input.validation ?? undefined,
      targetPath: input.targetPath,
      sortOrder: input.sortOrder,
    },
  });
  log.info({ capabilityId, parameterId: row.id, key: row.key }, "Admin added fabric parameter schema row");
  return row;
}

export const updateAdminParameterSchemaInput = fabricParameterSchemaInput.partial();
export type UpdateAdminParameterSchemaDraft = z.input<typeof updateAdminParameterSchemaInput>;

export async function updateAdminParameterSchema(
  capabilityId: string,
  parameterId: string,
  draft: UpdateAdminParameterSchemaDraft,
): Promise<FabricParameterSchema> {
  await requireRole("platform_admin", "operations");
  const input = updateAdminParameterSchemaInput.parse(draft);
  const row = await prisma.fabricParameterSchema.update({
    where: { id: parameterId, fabricCapabilityId: capabilityId },
    data: {
      ...(input.key !== undefined ? { key: input.key } : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.inputType !== undefined ? { inputType: input.inputType } : {}),
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
      ...(input.required !== undefined ? { required: input.required } : {}),
      ...(input.defaultValue !== undefined
        ? { defaultValue: (input.defaultValue === null ? Prisma.JsonNull : input.defaultValue) as Prisma.InputJsonValue }
        : {}),
      ...(input.options !== undefined
        ? { optionsJson: (input.options === null ? Prisma.JsonNull : input.options) as Prisma.InputJsonValue }
        : {}),
      ...(input.validation !== undefined
        ? { validationJson: (input.validation === null ? Prisma.JsonNull : input.validation) as Prisma.InputJsonValue }
        : {}),
      ...(input.targetPath !== undefined ? { targetPath: input.targetPath } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
  log.info({ capabilityId, parameterId }, "Admin updated fabric parameter schema row");
  return row;
}

export async function deleteAdminParameterSchema(capabilityId: string, parameterId: string): Promise<void> {
  await requireRole("platform_admin", "operations");
  await prisma.fabricParameterSchema.delete({ where: { id: parameterId, fabricCapabilityId: capabilityId } });
  log.info({ capabilityId, parameterId }, "Admin deleted fabric parameter schema row");
}
