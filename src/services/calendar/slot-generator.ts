/** Pure slot-generation logic shared by MockCalendarService and
 * GraphCalendarService — kept framework/DB-free so it can be unit tested
 * directly (tests/unit/slot-generator.test.ts). Not the appointment
 * scheduling policy itself (that lives in the calendar services), just
 * "which time windows does `ServiceAgent.workingHoursJson` make possible
 * within a date range".
 *
 * All computation is done in UTC. `ServiceAgent.workingHoursJson` is
 * assumed to already express hours in the agent's/organization's
 * reference timezone, which is deliberately not modeled per-agent yet —
 * see docs deviation note. */

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export type WorkingHours = Partial<Record<(typeof DAY_NAMES)[number], string[]>>;

export interface DateRange {
  from: Date;
  to: Date;
}

export interface SlotWindow {
  start: Date;
  end: Date;
}

export const DEFAULT_SLOT_DURATION_MINUTES = 60;
export const DEFAULT_LOOKAHEAD_BUSINESS_DAYS = 10;

/** `{customer}_..._`-style guard: only well-formed "HH:MM-HH:MM" 24h
 * intervals are honored; anything else in workingHoursJson is skipped
 * rather than throwing, since this is seeded/admin-entered data. */
const INTERVAL_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

/** Returns `{ from: tomorrow 00:00 UTC, to: end of the Nth business day }`
 * — the default window MockCalendarService/GraphCalendarService use when
 * the caller doesn't specify one ("next ~10 business days"). */
export function defaultAvailabilityWindow(now: Date, businessDays = DEFAULT_LOOKAHEAD_BUSINESS_DAYS): DateRange {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const to = new Date(from);
  // `from` itself counts as business day 1 if it isn't a weekend day —
  // otherwise the range would silently include one extra business day.
  let counted = isWeekend(from) ? 0 : 1;
  while (counted < businessDays) {
    to.setUTCDate(to.getUTCDate() + 1);
    if (!isWeekend(to)) counted++;
  }
  // `to` must cover the ENTIRE last business day, not just its midnight
  // instant — generateCandidateSlots filters by `slotEnd <= range.to`, so
  // a midnight `to` would silently exclude every slot on that last day.
  to.setUTCHours(23, 59, 59, 999);
  return { from, to };
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** Generates every non-overlapping `slotDurationMinutes` slot that fits
 * inside the agent's working-hours intervals, restricted to `range`.
 * Deterministic and side-effect free — callers are responsible for
 * filtering out slots that collide with existing bookings. */
export function generateCandidateSlots(workingHours: WorkingHours, range: DateRange, slotDurationMinutes = DEFAULT_SLOT_DURATION_MINUTES): SlotWindow[] {
  if (slotDurationMinutes <= 0) return [];

  const slots: SlotWindow[] = [];
  const cursorDay = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), range.from.getUTCDate()));
  const lastDay = new Date(Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), range.to.getUTCDate()));

  for (; cursorDay <= lastDay; cursorDay.setUTCDate(cursorDay.getUTCDate() + 1)) {
    const dayName = DAY_NAMES[cursorDay.getUTCDay()];
    const intervals = workingHours[dayName] ?? [];

    for (const interval of intervals) {
      const match = INTERVAL_PATTERN.exec(interval);
      if (!match) continue;

      const [, startHour, startMinute, endHour, endMinute] = match;
      const intervalStart = new Date(cursorDay);
      intervalStart.setUTCHours(Number(startHour), Number(startMinute), 0, 0);
      const intervalEnd = new Date(cursorDay);
      intervalEnd.setUTCHours(Number(endHour), Number(endMinute), 0, 0);
      if (intervalEnd <= intervalStart) continue;

      let slotStart = new Date(intervalStart);
      while (true) {
        const slotEnd = new Date(slotStart.getTime() + slotDurationMinutes * 60_000);
        if (slotEnd > intervalEnd) break;
        if (slotStart >= range.from && slotEnd <= range.to) {
          slots.push({ start: new Date(slotStart), end: slotEnd });
        }
        slotStart = slotEnd;
      }
    }
  }

  return slots;
}

/** True if two [start, end) windows overlap. */
export function windowsOverlap(a: SlotWindow, b: SlotWindow): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Removes any candidate slot that overlaps one of `busy`. */
export function excludeBusySlots(candidates: SlotWindow[], busy: SlotWindow[]): SlotWindow[] {
  if (busy.length === 0) return candidates;
  return candidates.filter((candidate) => !busy.some((b) => windowsOverlap(candidate, b)));
}
