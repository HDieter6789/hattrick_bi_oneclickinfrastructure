import type { Appointment } from "@/generated/prisma/client";
import type { DateRange } from "./slot-generator";

export interface AvailableSlot {
  serviceAgentId: string;
  start: Date;
  end: Date;
}

export interface BookSlotInput {
  serviceAgentId: string;
  customerId: string;
  startTime: Date;
  endTime: Date;
  subject?: string;
  notes?: string;
}

/**
 * The only interface the rest of the application uses to work with agent
 * calendars — same interface+mock/real+factory pattern as
 * services/fabric and services/graph. `getAvailableSlots` reads working
 * hours (see slot-generator.ts) minus whatever is already booked;
 * `bookSlot` creates the external calendar event (mocked or real Graph
 * event) AND the `Appointment` row; `cancelSlot` reverses both.
 *
 * Design choice (brief section 25/49 leaves this open — "pick the simpler
 * one"): booking a slot creates the Appointment as `pending`, not
 * `confirmed`. Confirmation is a separate, explicit action
 * (features/appointments confirmAppointment) — this keeps "pick a slot"
 * and "confirm the appointment" as two distinct, auditable steps matching
 * both the Appointment picker UI ("lets the user pick a slot and confirm
 * it") and the schema default (`AppointmentStatus @default(pending)`).
 * The deployment gate in services/provisioning/preflight.ts only ever
 * looks at `status === "confirmed"`, so an unconfirmed booking cannot
 * unblock deployment on its own.
 */
export interface CalendarService {
  getAvailableSlots(serviceAgentId: string, dateRange?: DateRange): Promise<AvailableSlot[]>;
  bookSlot(input: BookSlotInput): Promise<Appointment>;
  cancelSlot(appointmentId: string): Promise<Appointment>;
}

export class SlotUnavailableError extends Error {
  constructor(message = "The requested time slot is no longer available") {
    super(message);
    this.name = "SlotUnavailableError";
  }
}
