import { describe, expect, it } from "vitest";
import { defaultAvailabilityWindow, excludeBusySlots, generateCandidateSlots, windowsOverlap } from "@/services/calendar/slot-generator";

// 2026-08-31 is a Monday (UTC), 2026-09-01 is a Tuesday, 2026-09-05/06 is
// the following Sat/Sun — used as fixed anchors so the tests are
// deterministic regardless of when they run.
const MONDAY = new Date(Date.UTC(2026, 7, 31));
const TUESDAY = new Date(Date.UTC(2026, 8, 1));
const SATURDAY = new Date(Date.UTC(2026, 8, 5));

/** `range.to` is an inclusive instant bound (see slot-generator.ts), so a
 * "whole day" range must extend through the end of that day — passing
 * midnight would exclude every slot on it. */
function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

describe("generateCandidateSlots", () => {
  const workingHours = {
    monday: ["09:00-17:00"],
    tuesday: ["09:00-12:00"],
  };

  it("generates one slot per hour across a working-hours interval", () => {
    const slots = generateCandidateSlots(workingHours, { from: MONDAY, to: endOfDay(MONDAY) }, 60);
    expect(slots).toHaveLength(8); // 09-10, 10-11, ..., 16-17
    expect(slots[0].start.toISOString()).toBe("2026-08-31T09:00:00.000Z");
    expect(slots[0].end.toISOString()).toBe("2026-08-31T10:00:00.000Z");
    expect(slots.at(-1)!.end.toISOString()).toBe("2026-08-31T17:00:00.000Z");
  });

  it("respects a shorter interval on a different day", () => {
    const slots = generateCandidateSlots(workingHours, { from: TUESDAY, to: endOfDay(TUESDAY) }, 60);
    expect(slots).toHaveLength(3); // 09-10, 10-11, 11-12
  });

  it("produces no slots for a day with no configured working hours", () => {
    const slots = generateCandidateSlots(workingHours, { from: SATURDAY, to: endOfDay(SATURDAY) }, 60);
    expect(slots).toHaveLength(0);
  });

  it("produces no slots when workingHoursJson is empty", () => {
    expect(generateCandidateSlots({}, { from: MONDAY, to: endOfDay(TUESDAY) }, 60)).toHaveLength(0);
  });

  it("ignores malformed interval strings instead of throwing", () => {
    const slots = generateCandidateSlots({ monday: ["not-a-time-range"] }, { from: MONDAY, to: endOfDay(MONDAY) }, 60);
    expect(slots).toHaveLength(0);
  });

  it("supports a different slot duration", () => {
    const slots = generateCandidateSlots(workingHours, { from: TUESDAY, to: endOfDay(TUESDAY) }, 90);
    // 09:00-12:00 in 90-minute increments: 09:00-10:30, 10:30-12:00
    expect(slots).toHaveLength(2);
    expect(slots[1].end.toISOString()).toBe("2026-09-01T12:00:00.000Z");
  });

  it("clips slots to the requested range even when working hours extend beyond it", () => {
    const midMonday = new Date(Date.UTC(2026, 7, 31, 12, 0));
    const slots = generateCandidateSlots(workingHours, { from: midMonday, to: endOfDay(MONDAY) }, 60);
    expect(slots.every((s) => s.start >= midMonday)).toBe(true);
  });
});

describe("windowsOverlap / excludeBusySlots", () => {
  it("detects overlapping windows", () => {
    const a = { start: new Date("2026-08-31T09:00:00Z"), end: new Date("2026-08-31T10:00:00Z") };
    const b = { start: new Date("2026-08-31T09:30:00Z"), end: new Date("2026-08-31T10:30:00Z") };
    const c = { start: new Date("2026-08-31T10:00:00Z"), end: new Date("2026-08-31T11:00:00Z") };
    expect(windowsOverlap(a, b)).toBe(true);
    expect(windowsOverlap(a, c)).toBe(false); // back-to-back, not overlapping
  });

  it("filters out any candidate overlapping a busy window", () => {
    const candidates = generateCandidateSlots({ monday: ["09:00-12:00"] }, { from: MONDAY, to: endOfDay(MONDAY) }, 60);
    const busy = [{ start: new Date("2026-08-31T10:00:00Z"), end: new Date("2026-08-31T11:00:00Z") }];
    const free = excludeBusySlots(candidates, busy);
    expect(free).toHaveLength(2);
    expect(free.some((s) => s.start.toISOString() === "2026-08-31T10:00:00.000Z")).toBe(false);
  });

  it("returns all candidates unchanged when there is no busy time", () => {
    const candidates = generateCandidateSlots({ monday: ["09:00-11:00"] }, { from: MONDAY, to: endOfDay(MONDAY) }, 60);
    expect(excludeBusySlots(candidates, [])).toEqual(candidates);
  });
});

describe("defaultAvailabilityWindow", () => {
  it("starts strictly after 'now' and skips weekends when counting business days", () => {
    // Friday 2026-09-04 UTC as "now" — the window should start Saturday
    // (skipped in generation, but `from` itself is just midnight the next
    // calendar day) and span forward to a `to` that is itself a weekday.
    const now = new Date(Date.UTC(2026, 8, 4, 15, 0));
    const { from, to } = defaultAvailabilityWindow(now, 5);
    expect(from.getUTCHours()).toBe(0);
    expect(from > now).toBe(true);
    expect(to.getUTCDay()).not.toBe(0);
    expect(to.getUTCDay()).not.toBe(6);
    expect(to > from).toBe(true);
  });

  it("counts exactly N weekdays between from and to", () => {
    const now = new Date(Date.UTC(2026, 7, 30)); // Sunday
    const { from, to } = defaultAvailabilityWindow(now, 10);
    let weekdays = 0;
    const cursor = new Date(from);
    while (cursor <= to) {
      const day = cursor.getUTCDay();
      if (day !== 0 && day !== 6) weekdays++;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    expect(weekdays).toBe(10);
  });
});
