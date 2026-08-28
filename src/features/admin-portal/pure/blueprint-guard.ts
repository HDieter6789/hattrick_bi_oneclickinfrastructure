/**
 * Pure deletability guard for DELETE /api/admin/blueprints/[id]. Two
 * independent reasons a blueprint must never be deleted:
 *
 *  1. `isSystem` rows are seeded (prisma/seed/blueprints.ts) and are
 *     documented in the schema itself as "not user-deletable".
 *  2. Any blueprint still referenced by an `InfrastructureConfiguration`
 *     (`referencingConfigurationCount > 0`) would otherwise orphan that
 *     configuration's `blueprintId` foreign key.
 *
 * Kept free of any `@/db/prisma` import so the guard logic can be
 * unit-tested without a live DATABASE_URL.
 */

export class SystemBlueprintNotDeletableError extends Error {
  constructor() {
    super("System blueprints are seeded and cannot be deleted");
    this.name = "SystemBlueprintNotDeletableError";
  }
}

export class BlueprintInUseError extends Error {
  constructor(referencingConfigurationCount: number) {
    super(`Blueprint is still referenced by ${referencingConfigurationCount} infrastructure configuration(s) and cannot be deleted`);
    this.name = "BlueprintInUseError";
  }
}

export interface BlueprintDeletabilityInput {
  isSystem: boolean;
  referencingConfigurationCount: number;
}

/** Throws `SystemBlueprintNotDeletableError` or `BlueprintInUseError` when
 * the blueprint must not be deleted; returns void (no throw) otherwise. */
export function assertBlueprintDeletable(input: BlueprintDeletabilityInput): void {
  if (input.isSystem) throw new SystemBlueprintNotDeletableError();
  if (input.referencingConfigurationCount > 0) throw new BlueprintInUseError(input.referencingConfigurationCount);
}
