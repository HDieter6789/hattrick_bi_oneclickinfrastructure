import { z } from "zod";
import { CustomerEnvironmentMode, ServiceTier, CustomerStatus } from "@/generated/prisma/enums";

/** Mirrors prisma's enums (prisma/schema/customer.prisma). Using the
 * generated enum objects directly (not hand-written literals) matches the
 * convention already used by src/schemas/ingestion.ts for schemas that a
 * wizard form renders directly from — plain string-keyed objects, safe to
 * bundle client-side. */
export const customerEnvironmentModeSchema = z.enum(CustomerEnvironmentMode);
export const serviceTierSchema = z.enum(ServiceTier);
export const customerStatusSchema = z.enum(CustomerStatus);

export const createCustomerInput = z.object({
  companyName: z.string().min(1).max(200),
  contactFirstName: z.string().min(1).max(100),
  contactLastName: z.string().min(1).max(100),
  contactEmail: z.email(),
  contactPhone: z.string().min(1).max(50).optional(),
  tenantId: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  environmentMode: customerEnvironmentModeSchema.default("single"),
  serviceTier: serviceTierSchema.default("standard"),
});
export type CreateCustomerInput = z.infer<typeof createCustomerInput>;
/** Pre-validation shape (defaulted fields optional) — see
 * src/schemas/fabric-capability.ts for why z.input/z.infer are split. */
export type CreateCustomerDraft = z.input<typeof createCustomerInput>;

export const updateCustomerInput = z.object({
  companyName: z.string().min(1).max(200).optional(),
  contactFirstName: z.string().min(1).max(100).optional(),
  contactLastName: z.string().min(1).max(100).optional(),
  contactEmail: z.email().optional(),
  contactPhone: z.string().min(1).max(50).nullable().optional(),
  tenantId: z.string().min(1).nullable().optional(),
  domain: z.string().min(1).nullable().optional(),
  environmentMode: customerEnvironmentModeSchema.optional(),
  serviceTier: serviceTierSchema.optional(),
  status: customerStatusSchema.optional(),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerInput>;
export type UpdateCustomerDraft = z.input<typeof updateCustomerInput>;
