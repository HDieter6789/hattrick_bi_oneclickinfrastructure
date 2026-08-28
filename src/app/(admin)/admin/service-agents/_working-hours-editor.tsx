"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A simple per-weekday editor for `workingHoursJson`
 * (`Record<string, string[]>`, e.g. `{ "mon": ["09:00-17:00"] }`) — each day
 * is one comma-separated text field of time windows, which keeps the form
 * generic enough for any window format the calendar service expects
 * without hand-building a full time-range picker (out of scope per the
 * brief: "a simple day/hours editor ... if a structured editor is too much
 * scope"). */

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type WorkingHoursFormState = Record<(typeof WEEKDAYS)[number], string>;

export function emptyWorkingHours(): WorkingHoursFormState {
  return { mon: "", tue: "", wed: "", thu: "", fri: "", sat: "", sun: "" };
}

export function workingHoursJsonToFormState(json: Record<string, string[]>): WorkingHoursFormState {
  const state = emptyWorkingHours();
  for (const day of WEEKDAYS) {
    state[day] = (json[day] ?? []).join(", ");
  }
  return state;
}

export function formStateToWorkingHoursJson(state: WorkingHoursFormState): Record<string, string[]> {
  const json: Record<string, string[]> = {};
  for (const day of WEEKDAYS) {
    const windows = state[day]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (windows.length > 0) json[day] = windows;
  }
  return json;
}

export function WorkingHoursEditor({ value, onChange }: { value: WorkingHoursFormState; onChange: (next: WorkingHoursFormState) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>Working hours (comma-separated windows per day, e.g. &quot;09:00-12:00, 13:00-17:00&quot;)</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {WEEKDAYS.map((day) => (
          <div key={day} className="flex items-center gap-2">
            <span className="w-10 text-xs text-muted-foreground uppercase">{day}</span>
            <Input value={value[day]} onChange={(e) => onChange({ ...value, [day]: e.target.value })} placeholder="09:00-17:00" />
          </div>
        ))}
      </div>
    </div>
  );
}
