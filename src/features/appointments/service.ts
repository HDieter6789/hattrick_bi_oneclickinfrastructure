import "server-only";
import { prisma } from "@/db/prisma";
import { requireAuth, requireRole } from "@/lib/authz";
import { requireCustomerAccess } from "@/lib/require-customer-access";
import { childLogger } from "@/lib/logger";
import { getCalendarService, type AvailableSlot } from "@/services/calendar";
import { autoAssignServiceAgent } from "@/services/appointments/auto-assign";
import type { Appointment, ServiceAgent } from "@/generated/prisma/client";
import {
  bookAppointmentInput,
  createServiceAgentInput,
  listServiceAgentsQueryInput,
  updateServiceAgentInput,
  type AvailableSlotsQueryDraft,
  type BookAppointmentDraft,
  type CreateServiceAgentDraft,
  type ListServiceAgentsQueryDraft,
  type UpdateServiceAgentDraft,
} from "./schemas";

const log = childLogger({ module: "appointments.service" });

/** Every function here is a privileged/customer-scoped server action per
 * src/lib/authz.ts — route handlers under src/app/api/appointments and
 * src/app/api/service-agents are thin wrappers around these, never
 * re-implementing the authz/validation. */

// ---- Service agents (admin-only CRUD) --------------------------------

export async function createServiceAgent(draft: CreateServiceAgentDraft): Promise<ServiceAgent> {
  await requireRole("platform_admin");
  const input = createServiceAgentInput.parse(draft);

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new Error(`User ${input.userId} not found`);

  const agent = await prisma.serviceAgent.create({
    data: {
      userId: input.userId,
      calendarUserId: input.calendarUserId,
      skills: input.skills,
      language: input.language,
      workingHoursJson: input.workingHoursJson,
    },
  });
  log.info({ serviceAgentId: agent.id, userId: input.userId }, "Service agent created");
  return agent;
}

export async function updateServiceAgent(serviceAgentId: string, draft: UpdateServiceAgentDraft): Promise<ServiceAgent> {
  await requireRole("platform_admin");
  const input = updateServiceAgentInput.parse(draft);
  const agent = await prisma.serviceAgent.update({ where: { id: serviceAgentId }, data: input });
  log.info({ serviceAgentId }, "Service agent updated");
  return agent;
}

export async function deactivateServiceAgent(serviceAgentId: string): Promise<ServiceAgent> {
  await requireRole("platform_admin");
  const agent = await prisma.serviceAgent.update({ where: { id: serviceAgentId }, data: { active: false } });
  log.info({ serviceAgentId }, "Service agent deactivated");
  return agent;
}

export async function listServiceAgents(draft: ListServiceAgentsQueryDraft = {}): Promise<ServiceAgent[]> {
  // Any authenticated user may list agents — a customer booking their own
  // onboarding needs to see the roster to pick one manually. Nothing
  // customer-scoped is read here (ServiceAgent has no customerId), so
  // requireAuth() is the right bar, not requireCustomerAccess.
  await requireAuth();
  const input = listServiceAgentsQueryInput.parse(draft);
  return prisma.serviceAgent.findMany({
    where: {
      ...(input.activeOnly ? { active: true } : {}),
      ...(input.skill ? { skills: { has: input.skill } } : {}),
      ...(input.language ? { language: input.language } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}

// ---- Appointment slots / booking (customer-scoped) --------------------

export interface AvailableSlotsResult {
  agent: ServiceAgent | null;
  slots: AvailableSlot[];
}

/** Resolves which agent to show slots for — the caller's explicit choice,
 * or automatic assignment (brief section 26) — and returns that agent's
 * available slots for the standard lookahead window. Used directly by the
 * appointment picker component. */
export async function getAvailableSlotsForCustomer(draft: AvailableSlotsQueryDraft): Promise<AvailableSlotsResult> {
  const { customerId, serviceAgentId, requiredSkill, requiredLanguage } = draft;
  await requireCustomerAccess(customerId);

  let agent: ServiceAgent | null = null;
  if (serviceAgentId) {
    agent = await prisma.serviceAgent.findUnique({ where: { id: serviceAgentId } });
    if (!agent || !agent.active) throw new Error("Service agent not found or inactive");
  } else {
    agent = await autoAssignServiceAgent(customerId, { requiredSkill, requiredLanguage });
  }

  if (!agent) return { agent: null, slots: [] };
  const slots = await getCalendarService().getAvailableSlots(agent.id);
  return { agent, slots };
}

/** Books a slot — creates the calendar event and the Appointment row as
 * `pending` (see services/calendar/calendar-service.ts for why booking
 * and confirming are separate steps). */
export async function bookAppointment(draft: BookAppointmentDraft): Promise<Appointment> {
  const input = bookAppointmentInput.parse(draft);
  await requireCustomerAccess(input.customerId);
  const appointment = await getCalendarService().bookSlot(input);
  log.info({ appointmentId: appointment.id, customerId: input.customerId }, "Appointment booked");
  return appointment;
}

/**
 * Confirms a pending appointment — the ONLY way `Appointment.status`
 * becomes `"confirmed"`. This is what the mandatory deployment gate
 * (services/provisioning/preflight.ts, `appointment_confirmed` check)
 * ultimately depends on: it reads `appointment.status === "confirmed"`
 * straight from the database, so it can only ever be satisfied by a real
 * customer/staff action going through this function — never by a default
 * or by directly calling the deployment API.
 */
export async function confirmAppointment(appointmentId: string): Promise<Appointment> {
  const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
  await requireCustomerAccess(appointment.customerId);

  if (appointment.status === "cancelled") throw new Error("Cannot confirm a cancelled appointment");
  if (appointment.status === "confirmed" || appointment.status === "completed") return appointment;

  const updated = await prisma.appointment.update({ where: { id: appointmentId }, data: { status: "confirmed" } });
  log.info({ appointmentId }, "Appointment confirmed");
  return updated;
}

export async function cancelAppointment(appointmentId: string): Promise<Appointment> {
  const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
  await requireCustomerAccess(appointment.customerId);
  const cancelled = await getCalendarService().cancelSlot(appointmentId);
  log.info({ appointmentId }, "Appointment cancelled");
  return cancelled;
}

export async function listAppointmentsForCustomer(customerId: string): Promise<Appointment[]> {
  await requireCustomerAccess(customerId);
  return prisma.appointment.findMany({
    where: { customerId },
    orderBy: { startTime: "desc" },
    include: { serviceAgent: { include: { user: true } } },
  });
}
