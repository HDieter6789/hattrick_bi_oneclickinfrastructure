import { randomUUID } from "node:crypto";
import { prisma } from "@/db/prisma";
import { childLogger } from "@/lib/logger";
import type { Appointment } from "@/generated/prisma/client";
import type { AvailableSlot, BookSlotInput, CalendarService } from "./calendar-service";
import { SlotUnavailableError } from "./calendar-service";
import { defaultAvailabilityWindow, excludeBusySlots, generateCandidateSlots, windowsOverlap, type DateRange, type WorkingHours } from "./slot-generator";

const log = childLogger({ module: "calendar.mock-service" });

const ACTIVE_STATUSES = ["pending", "confirmed"] as const;

/**
 * Demo-mode calendar. The EXTERNAL calendar system is what's mocked here
 * (no real Graph calendar event is ever created) — bookings themselves
 * are always persisted to the real `Appointment` table, in demo mode and
 * in production alike, so the rest of the app (preflight gate, admin
 * portal, appointment picker) works identically regardless of
 * CALENDAR_PROVIDER.
 */
export class MockCalendarService implements CalendarService {
  async getAvailableSlots(serviceAgentId: string, dateRange?: DateRange): Promise<AvailableSlot[]> {
    const agent = await prisma.serviceAgent.findUniqueOrThrow({ where: { id: serviceAgentId } });
    if (!agent.active) return [];

    const range = dateRange ?? defaultAvailabilityWindow(new Date());
    const candidates = generateCandidateSlots(agent.workingHoursJson as WorkingHours, range);

    const existing = await prisma.appointment.findMany({
      where: {
        serviceAgentId,
        status: { in: [...ACTIVE_STATUSES] },
        startTime: { lt: range.to },
        endTime: { gt: range.from },
      },
      select: { startTime: true, endTime: true },
    });

    const free = excludeBusySlots(
      candidates,
      existing.map((e) => ({ start: e.startTime, end: e.endTime })),
    );
    return free.map((slot) => ({ serviceAgentId, start: slot.start, end: slot.end }));
  }

  async bookSlot(input: BookSlotInput): Promise<Appointment> {
    const agent = await prisma.serviceAgent.findUniqueOrThrow({ where: { id: input.serviceAgentId } });
    if (!agent.active) {
      throw new SlotUnavailableError("This service agent is not currently active");
    }

    return prisma.$transaction(async (tx) => {
      const overlapping = await tx.appointment.findMany({
        where: {
          serviceAgentId: input.serviceAgentId,
          status: { in: [...ACTIVE_STATUSES] },
          startTime: { lt: input.endTime },
          endTime: { gt: input.startTime },
        },
        select: { id: true },
      });
      if (overlapping.length > 0) {
        throw new SlotUnavailableError();
      }

      const candidates = generateCandidateSlots(agent.workingHoursJson as WorkingHours, { from: input.startTime, to: input.endTime });
      const withinWorkingHours = candidates.some((slot) => windowsOverlap(slot, { start: input.startTime, end: input.endTime }) && slot.start.getTime() === input.startTime.getTime() && slot.end.getTime() === input.endTime.getTime());
      if (!withinWorkingHours) {
        throw new SlotUnavailableError("The requested time is outside this agent's working hours");
      }

      const appointment = await tx.appointment.create({
        data: {
          customerId: input.customerId,
          serviceAgentId: input.serviceAgentId,
          startTime: input.startTime,
          endTime: input.endTime,
          notes: input.notes,
          calendarEventId: `mock-evt-${randomUUID()}`,
          status: "pending",
        },
      });
      log.info({ appointmentId: appointment.id, serviceAgentId: input.serviceAgentId }, "Mock calendar booking created");
      return appointment;
    });
  }

  async cancelSlot(appointmentId: string): Promise<Appointment> {
    const appointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: "cancelled" },
    });
    log.info({ appointmentId }, "Mock calendar booking cancelled");
    return appointment;
  }
}
