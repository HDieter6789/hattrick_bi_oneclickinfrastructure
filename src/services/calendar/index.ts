import { getEnv } from "@/lib/env";
import { getGraphClient } from "@/services/graph";
import type { CalendarService } from "./calendar-service";
import { MockCalendarService } from "./mock-calendar-service";
import { GraphCalendarService } from "./graph-calendar-service";

let cached: CalendarService | null = null;

/** Factory — keyed off CALENDAR_PROVIDER (mock|graph), NOT DEMO_MODE,
 * because "which external calendar system" is an independent choice from
 * "are we in demo mode" (see env.ts). When CALENDAR_PROVIDER=graph, the
 * underlying MicrosoftGraphClient itself is still selected by DEMO_MODE
 * via services/graph — so demo mode can still exercise the Graph calendar
 * code path end-to-end against the mock Graph client. */
export function getCalendarService(): CalendarService {
  if (cached) return cached;
  const provider = getEnv().CALENDAR_PROVIDER;
  cached = provider === "graph" ? new GraphCalendarService(getGraphClient()) : new MockCalendarService();
  return cached;
}

export type { AvailableSlot, BookSlotInput, CalendarService } from "./calendar-service";
export { SlotUnavailableError } from "./calendar-service";
export {
  DEFAULT_LOOKAHEAD_BUSINESS_DAYS,
  DEFAULT_SLOT_DURATION_MINUTES,
  defaultAvailabilityWindow,
  generateCandidateSlots,
} from "./slot-generator";
export type { DateRange, SlotWindow, WorkingHours } from "./slot-generator";
