/**
 * Client-safe Zod schemas for the admin portal's mutation forms.
 *
 * The canonical schemas for these inputs live in `src/features/admin-portal/**`,
 * but every file there starts with `import "server-only"` — importing a
 * value (even just a Zod schema constant) from one of those modules into a
 * "use client" component would pull `server-only` into the browser bundle,
 * which throws at build time. So this module re-derives the same
 * constraints client-side, sourcing values from the same places the server
 * schemas do wherever possible:
 *
 *  - Enum members come from `@/generated/prisma/enums` (plain generated
 *    constants, the same source the server-only schemas mirror in their own
 *    comments) rather than being retyped as string literals here.
 *  - `updateFabricCapabilityClientInput` is derived from
 *    `registerFabricCapabilityInput` (`@/schemas/fabric-capability`, which
 *    has no `server-only` import and is safe to share) via the exact same
 *    `.omit(...).partial()` call `features/admin-portal/fabric-capabilities.ts`
 *    applies server-side — not a redefinition, the same derivation run twice.
 *  - `fabricParameterSchemaInput` itself needs no mirror at all: it is
 *    imported directly from `@/schemas/fabric-capability` at each call site.
 *  - Only the blueprint create/update shapes and the two admin
 *    status-update envelopes are structurally duplicated, because no
 *    client-safe module defines them; each is annotated with the exact
 *    server-side declaration it mirrors so the two stay easy to keep in sync.
 */

import { z } from "zod";
import { registerFabricCapabilityInput } from "@/schemas/fabric-capability";
import { AlertStatus, ArchitecturePattern, CustomerStatus } from "@/generated/prisma/enums";

// Mirrors features/admin-portal/customers.ts's `customerStatusSchema` /
// `updateCustomerStatusInput`.
export const customerStatusSchema = z.enum(CustomerStatus);
export const updateCustomerStatusClientInput = z.object({ status: customerStatusSchema });
export type UpdateCustomerStatusClientInput = z.infer<typeof updateCustomerStatusClientInput>;

// Mirrors features/admin-portal/alerts.ts's `updateAdminAlertInput` — only
// "acknowledged"/"resolved" are transitions the admin action ever issues
// ("open" is the initial DB default, never a target status here).
export const updateAdminAlertClientInput = z.object({
  status: z.enum([AlertStatus.acknowledged, AlertStatus.resolved]),
});
export type UpdateAdminAlertClientInput = z.infer<typeof updateAdminAlertClientInput>;

// Mirrors features/admin-portal/blueprints.ts's `architecturePatternSchema`.
export const architecturePatternSchema = z.enum(ArchitecturePattern);

// Mirrors features/admin-portal/blueprints.ts's `blueprintResourceInput`.
export const blueprintResourceClientInput = z.object({
  itemType: z.string().min(1, "Required"),
  logicalName: z.string().min(1, "Required"),
  displayNameTemplate: z.string().min(1, "Required"),
  configuration: z.record(z.string(), z.unknown()).default({}),
  dependsOn: z.array(z.string()).default([]),
  optional: z.boolean().default(false),
  layer: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
});
export type BlueprintResourceClientInput = z.input<typeof blueprintResourceClientInput>;

// Mirrors features/admin-portal/blueprints.ts's `createBlueprintInput`.
export const createBlueprintClientInput = z.object({
  key: z.string().min(1, "Required"),
  name: z.string().min(1, "Required"),
  description: z.string().optional(),
  pattern: architecturePatternSchema.default("custom"),
  resources: z.array(blueprintResourceClientInput).default([]),
});
export type CreateBlueprintClientInput = z.input<typeof createBlueprintClientInput>;

// Mirrors features/admin-portal/blueprints.ts's `updateBlueprintInput`.
export const updateBlueprintClientInput = z.object({
  name: z.string().min(1, "Required").optional(),
  description: z.string().nullable().optional(),
  pattern: architecturePatternSchema.optional(),
  resources: z.array(blueprintResourceClientInput).optional(),
});
export type UpdateBlueprintClientInput = z.input<typeof updateBlueprintClientInput>;

// Derived (not redefined) from the shared, client-safe
// `registerFabricCapabilityInput` — see module doc above. Mirrors
// features/admin-portal/fabric-capabilities.ts's
// `updateAdminFabricCapabilityInput`.
export const updateFabricCapabilityClientInput = registerFabricCapabilityInput.omit({ itemType: true, parameters: true }).partial();
export type UpdateFabricCapabilityClientInput = z.input<typeof updateFabricCapabilityClientInput>;

// Mirrors features/admin-portal/fabric-capabilities.ts's
// `createAdminFabricCapability` input (the full `registerFabricCapabilityInput`,
// re-exported here only for a single, obvious import site in the "create
// capability" form).
export const createFabricCapabilityClientInput = registerFabricCapabilityInput;
export type CreateFabricCapabilityClientInput = z.input<typeof createFabricCapabilityClientInput>;
