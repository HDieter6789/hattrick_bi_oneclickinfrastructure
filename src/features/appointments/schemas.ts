import { z } from "zod";

/** Mirrors prisma's `ServiceSkill` enum (prisma/schema/service.prisma) —
 * kept as literal strings here rather than importing the generated enum
 * so this schema module stays usable from client-side form code without
 * pulling in the Prisma client, matching src/schemas/fabric-capability.ts. */
export const serviceSkillSchema = z.enum(["fabric", "power_bi", "data_engineering", "data_science", "realtime"]);

const workingHoursSchema = z.record(z.string(), z.array(z.string()));

export const createServiceAgentInput = z.object({
  userId: z.string().min(1),
  calendarUserId: z.string().min(1).optional(),
  skills: z.array(serviceSkillSchema).default([]),
  language: z.string().min(2).max(10).default("en"),
  workingHoursJson: workingHoursSchema.default({}),
});
export type CreateServiceAgentInput = z.infer<typeof createServiceAgentInput>;
/** Pre-validation shape (defaulted fields optional) — see
 * src/schemas/fabric-capability.ts for why z.input/z.infer are split. */
export type CreateServiceAgentDraft = z.input<typeof createServiceAgentInput>;

export const updateServiceAgentInput = z.object({
  calendarUserId: z.string().min(1).nullable().optional(),
  skills: z.array(serviceSkillSchema).optional(),
  language: z.string().min(2).max(10).optional(),
  workingHoursJson: workingHoursSchema.optional(),
  active: z.boolean().optional(),
});
export type UpdateServiceAgentInput = z.infer<typeof updateServiceAgentInput>;
export type UpdateServiceAgentDraft = z.input<typeof updateServiceAgentInput>;

export const bookAppointmentInput = z.object({
  customerId: z.string().min(1),
  serviceAgentId: z.string().min(1),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  notes: z.string().max(2000).optional(),
});
export type BookAppointmentInput = z.infer<typeof bookAppointmentInput>;
export type BookAppointmentDraft = z.input<typeof bookAppointmentInput>;

export const availableSlotsQueryInput = z.object({
  customerId: z.string().min(1),
  serviceAgentId: z.string().min(1).optional(),
  requiredSkill: serviceSkillSchema.optional(),
  requiredLanguage: z.string().optional(),
});
export type AvailableSlotsQueryInput = z.infer<typeof availableSlotsQueryInput>;
export type AvailableSlotsQueryDraft = z.input<typeof availableSlotsQueryInput>;

export const listServiceAgentsQueryInput = z.object({
  skill: serviceSkillSchema.optional(),
  language: z.string().optional(),
  activeOnly: z.boolean().default(true),
});
export type ListServiceAgentsQueryInput = z.infer<typeof listServiceAgentsQueryInput>;
export type ListServiceAgentsQueryDraft = z.input<typeof listServiceAgentsQueryInput>;
