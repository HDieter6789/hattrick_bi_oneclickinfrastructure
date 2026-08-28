import { describe, expect, it } from "vitest";
import { sortAlertsBySeverity, compareAlertsBySeverityThenRecency } from "@/features/admin-portal/pure/alert-sort";

const at = (isoMinutesAgo: number) => new Date(Date.now() - isoMinutesAgo * 60_000);

describe("sortAlertsBySeverity", () => {
  it("orders critical before warning before info", () => {
    const alerts = [
      { id: "a", severity: "info" as const, createdAt: at(0) },
      { id: "b", severity: "critical" as const, createdAt: at(10) },
      { id: "c", severity: "warning" as const, createdAt: at(5) },
    ];
    expect(sortAlertsBySeverity(alerts).map((a) => a.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties within the same severity by most-recent-first", () => {
    const alerts = [
      { id: "old", severity: "critical" as const, createdAt: at(60) },
      { id: "new", severity: "critical" as const, createdAt: at(1) },
    ];
    expect(sortAlertsBySeverity(alerts).map((a) => a.id)).toEqual(["new", "old"]);
  });

  it("does not mutate the input array", () => {
    const alerts = [
      { id: "a", severity: "info" as const, createdAt: at(0) },
      { id: "b", severity: "critical" as const, createdAt: at(1) },
    ];
    const original = [...alerts];
    sortAlertsBySeverity(alerts);
    expect(alerts).toEqual(original);
  });

  it("is stable/consistent as a comparator for Array.prototype.sort", () => {
    const a = { severity: "warning" as const, createdAt: at(5) };
    const b = { severity: "warning" as const, createdAt: at(5) };
    expect(compareAlertsBySeverityThenRecency(a, b)).toBe(0);
  });
});
