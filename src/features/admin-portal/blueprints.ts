import "server-only";
import { nanoid } from "nanoid";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { requireRole } from "@/lib/authz";
import { childLogger } from "@/lib/logger";
import { assertBlueprintDeletable } from "./pure/blueprint-guard";
import type { Blueprint, BlueprintResource, Prisma } from "@/generated/prisma/client";

const log = childLogger({ module: "admin.blueprints" });

export type BlueprintWithResources = Blueprint & { resources: BlueprintResource[] };

/** Mirrors prisma's `ArchitecturePattern` enum (prisma/schema/blueprint.prisma) —
 * kept as literal strings rather than importing the generated enum, matching
 * src/schemas/fabric-capability.ts's rationale. */
export const architecturePatternSchema = z.enum(["simple", "medallion", "enterprise", "custom"]);

const blueprintResourceInput = z.object({
  itemType: z.string().min(1),
  logicalName: z.string().min(1),
  displayNameTemplate: z.string().min(1),
  configuration: z.record(z.string(), z.unknown()).default({}),
  dependsOn: z.array(z.string()).default([]),
  optional: z.boolean().default(false),
  layer: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
});
export type BlueprintResourceDraft = z.input<typeof blueprintResourceInput>;

export const createBlueprintInput = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  pattern: architecturePatternSchema.default("custom"),
  resources: z.array(blueprintResourceInput).default([]),
});
export type CreateBlueprintInput = z.infer<typeof createBlueprintInput>;
export type CreateBlueprintDraft = z.input<typeof createBlueprintInput>;

export const updateBlueprintInput = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  pattern: architecturePatternSchema.optional(),
  // When provided, this fully replaces the blueprint's resource set
  // (delete-all + recreate in one transaction) — simpler and safer than a
  // partial diff for what is expected to be a low-frequency admin edit.
  resources: z.array(blueprintResourceInput).optional(),
});
export type UpdateBlueprintInput = z.infer<typeof updateBlueprintInput>;
export type UpdateBlueprintDraft = z.input<typeof updateBlueprintInput>;

export const listBlueprintsQuery = z.object({
  pattern: architecturePatternSchema.optional(),
});
export type ListBlueprintsDraft = z.input<typeof listBlueprintsQuery>;

export async function listAdminBlueprints(draft: ListBlueprintsDraft = {}): Promise<(BlueprintWithResources & { configurationCount: number })[]> {
  await requireRole("platform_admin", "operations", "service_agent");
  const input = listBlueprintsQuery.parse(draft);
  const blueprints = await prisma.blueprint.findMany({
    where: input.pattern ? { pattern: input.pattern } : undefined,
    include: {
      resources: { orderBy: { sortOrder: "asc" } },
      _count: { select: { configurations: true } },
    },
    orderBy: { name: "asc" },
  });
  return blueprints.map(({ _count, ...blueprint }) => ({ ...blueprint, configurationCount: _count.configurations }));
}

export async function getAdminBlueprint(id: string): Promise<BlueprintWithResources | null> {
  await requireRole("platform_admin", "operations", "service_agent");
  return prisma.blueprint.findUnique({
    where: { id },
    include: { resources: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function createAdminBlueprint(draft: CreateBlueprintDraft): Promise<BlueprintWithResources> {
  await requireRole("platform_admin", "operations");
  const input = createBlueprintInput.parse(draft);
  const blueprint = await prisma.blueprint.create({
    data: {
      key: input.key,
      name: input.name,
      description: input.description,
      pattern: input.pattern,
      isSystem: false,
      resources: {
        create: input.resources.map((r) => ({
          itemType: r.itemType,
          logicalName: r.logicalName,
          displayNameTemplate: r.displayNameTemplate,
          configuration: r.configuration as Prisma.InputJsonValue,
          dependsOn: r.dependsOn,
          optional: r.optional,
          layer: r.layer ?? undefined,
          sortOrder: r.sortOrder,
        })),
      },
    },
    include: { resources: { orderBy: { sortOrder: "asc" } } },
  });
  log.info({ blueprintId: blueprint.id, key: blueprint.key }, "Admin created blueprint");
  return blueprint;
}

export async function updateAdminBlueprint(id: string, draft: UpdateBlueprintDraft): Promise<BlueprintWithResources> {
  await requireRole("platform_admin", "operations");
  const input = updateBlueprintInput.parse(draft);

  const blueprint = await prisma.$transaction(async (tx) => {
    await tx.blueprint.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.pattern !== undefined ? { pattern: input.pattern } : {}),
      },
    });

    if (input.resources !== undefined) {
      await tx.blueprintResource.deleteMany({ where: { blueprintId: id } });
      if (input.resources.length > 0) {
        await tx.blueprintResource.createMany({
          data: input.resources.map((r) => ({
            blueprintId: id,
            itemType: r.itemType,
            logicalName: r.logicalName,
            displayNameTemplate: r.displayNameTemplate,
            configuration: r.configuration as Prisma.InputJsonValue,
            dependsOn: r.dependsOn,
            optional: r.optional,
            layer: r.layer ?? undefined,
            sortOrder: r.sortOrder,
          })),
        });
      }
    }

    return tx.blueprint.findUniqueOrThrow({
      where: { id },
      include: { resources: { orderBy: { sortOrder: "asc" } } },
    });
  });

  log.info({ blueprintId: id }, "Admin updated blueprint");
  return blueprint;
}

/** Deletes a blueprint after the isSystem / in-use guard passes — callers
 * (the route handler) are expected to have already inspected the guard's
 * thrown error and mapped it to the right HTTP status; this function
 * re-checks so it can never be called safely-but-incorrectly from a future
 * call site that forgets the guard. */
export async function deleteAdminBlueprint(id: string): Promise<void> {
  await requireRole("platform_admin", "operations");
  const blueprint = await prisma.blueprint.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { configurations: true } } },
  });
  assertBlueprintDeletable({ isSystem: blueprint.isSystem, referencingConfigurationCount: blueprint._count.configurations });
  await prisma.blueprint.delete({ where: { id } });
  log.warn({ blueprintId: id, key: blueprint.key }, "Admin deleted blueprint");
}

export async function cloneAdminBlueprint(id: string): Promise<BlueprintWithResources> {
  await requireRole("platform_admin", "operations");
  const original = await prisma.blueprint.findUniqueOrThrow({
    where: { id },
    include: { resources: { orderBy: { sortOrder: "asc" } } },
  });

  const clone = await prisma.blueprint.create({
    data: {
      key: `${original.key}-clone-${nanoid(6)}`,
      name: `${original.name} (Copy)`,
      description: original.description,
      pattern: original.pattern,
      isSystem: false,
      clonedFromId: original.id,
      resources: {
        create: original.resources.map((r) => ({
          itemType: r.itemType,
          logicalName: r.logicalName,
          displayNameTemplate: r.displayNameTemplate,
          configuration: r.configuration as Prisma.InputJsonValue,
          dependsOn: r.dependsOn,
          optional: r.optional,
          layer: r.layer,
          sortOrder: r.sortOrder,
        })),
      },
    },
    include: { resources: { orderBy: { sortOrder: "asc" } } },
  });

  log.info({ blueprintId: clone.id, clonedFromId: original.id }, "Admin cloned blueprint");
  return clone;
}
