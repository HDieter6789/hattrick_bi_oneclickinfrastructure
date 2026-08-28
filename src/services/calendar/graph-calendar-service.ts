import { prisma } from "@/db/prisma";
import { childLogger } from "@/lib/logger";
import type { MicrosoftGraphClient } from "@/services/graph/graph-client";
import { GraphApiException } from "@/services/graph/types";
import type { Appointment } from "@/generated/prisma/client";
import type { AvailableSlot, BookSlotInput, CalendarService } from "./calendar-service";
import { SlotUnavailableError } from "./calendar-service";
import { defaultAvailabilityWindow, excludeBusySlots, generateCandidateSlots, windowsOverlap, type DateRange, type WorkingHours } from "./slot-generator";

const log = childLogger({ module: "calendar.graph-service" });

const ACTIVE_STATUSES = ["pending", "confirmed"] as const;

/**
 * Production calendar backed by the agent's real Microsoft 365 mailbox
 * via Microsoft Graph (`ServiceAgent.calendarUserId`). Available slots are
 * computed the same way as MockCalendarService (working hours minus
 * busy time) but busy time comes from Graph's free/busy in addition to
 * our own Appointment table, so a meeting the agent booked outside this
 * app still blocks the slot.
 */
export class GraphCalendarService implements CalendarService {
  constructor(private readonly graph: MicrosoftGraphClient) {}

  async getAvailableSlots(serviceAgentId: string, dateRange?: DateRange): Promise<AvailableSlot[]> {
    const agent = await prisma.serviceAgent.findUniqueOrThrow({ where: { id: serviceAgentId } });
    if (!agent.active) return [];
    if (!agent.calendarUserId) {
      throw new Error(`Service agent ${serviceAgentId} has no calendarUserId configured for Microsoft Graph`);
    }

    const range = dateRange ?? defaultAvailabilityWindow(new Date());
    const candidates = generateCandidateSlots(agent.workingHoursJson as WorkingHours, range);

    const [freeBusyMap, existing] = await Promise.all([
      this.graph.getFreeBusy([agent.calendarUserId], range.from, range.to),
      prisma.appointment.findMany({
        where: {
          serviceAgentId,
          status: { in: [...ACTIVE_STATUSES] },
          startTime: { lt: range.to },
          endTime: { gt: range.from },
        },
        select: { startTime: true, endTime: true },
      }),
    ]);

    const graphBusy = (freeBusyMap.get(agent.calendarUserId) ?? [])
      .filter((slot) => slot.status !== "free")
      .map((slot) => ({ start: slot.start, end: slot.end }));
    const dbBusy = existing.map((e) => ({ start: e.startTime, end: e.endTime }));

    const free = excludeBusySlots(excludeBusySlots(candidates, graphBusy), dbBusy);
    return free.map((slot) => ({ serviceAgentId, start: slot.start, end: slot.end }));
  }

  async bookSlot(input: BookSlotInput): Promise<Appointment> {
    const [agent, customer] = await Promise.all([
      prisma.serviceAgent.findUniqueOrThrow({ where: { id: input.serviceAgentId } }),
      prisma.customer.findUniqueOrThrow({ where: { id: input.customerId } }),
    ]);
    if (!agent.active) throw new SlotUnavailableError("This service agent is not currently active");
    if (!agent.calendarUserId) {
      throw new Error(`Service agent ${input.serviceAgentId} has no calendarUserId configured for Microsoft Graph`);
    }

    const overlapping = await prisma.appointment.findMany({
      where: {
        serviceAgentId: input.serviceAgentId,
        status: { in: [...ACTIVE_STATUSES] },
        startTime: { lt: input.endTime },
        endTime: { gt: input.startTime },
      },
      select: { id: true },
    });
    if (overlapping.length > 0) throw new SlotUnavailableError();

    const candidates = generateCandidateSlots(agent.workingHoursJson as WorkingHours, { from: input.startTime, to: input.endTime });
    const withinWorkingHours = candidates.some(
      (slot) => windowsOverlap(slot, { start: input.startTime, end: input.endTime }) && slot.start.getTime() === input.startTime.getTime() && slot.end.getTime() === input.endTime.getTime(),
    );
    if (!withinWorkingHours) throw new SlotUnavailableError("The requested time is outside this agent's working hours");

    const event = await this.graph.createCalendarEvent(agent.calendarUserId, {
      subject: input.subject ?? `Fabric onboarding — ${customer.companyName}`,
      start: input.startTime,
      end: input.endTime,
      attendeeEmails: customer.contactEmail ? [customer.contactEmail] : [],
    });

    const appointment = await prisma.appointment.create({
      data: {
        customerId: input.customerId,
        serviceAgentId: input.serviceAgentId,
        startTime: input.startTime,
        endTime: input.endTime,
        notes: input.notes,
        calendarEventId: event.id,
        status: "pending",
      },
    });
    log.info({ appointmentId: appointment.id, calendarEventId: event.id }, "Graph calendar booking created");
    return appointment;
  }

  async cancelSlot(appointmentId: string): Promise<Appointment> {
    const appointment = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { serviceAgent: true },
    });

    if (appointment.calendarEventId && appointment.serviceAgent?.calendarUserId) {
      try {
        await this.graph.cancelCalendarEvent(appointment.serviceAgent.calendarUserId, appointment.calendarEventId);
      } catch (error) {
        // A 404 means the event is already gone from the calendar (e.g.
        // cancelled directly in Outlook) — not a reason to fail our own
        // cancellation. Any other error propagates.
        if (!(error instanceof GraphApiException && error.status === 404)) throw error;
      }
    }

    const updated = await prisma.appointment.update({ where: { id: appointmentId }, data: { status: "cancelled" } });
    log.info({ appointmentId }, "Graph calendar booking cancelled");
    return updated;
  }
}
