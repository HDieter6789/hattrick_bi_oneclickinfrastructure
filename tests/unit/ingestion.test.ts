import { describe, expect, it } from "vitest";
import { resolveScheduleCron, resolveScheduleIntervalMs } from "@/services/ingestion/schedule";
import { createIngestionConfigurationInput } from "@/schemas/ingestion";

describe("resolveScheduleCron", () => {
  it("resolves manual to no schedule", () => {
    expect(resolveScheduleCron("manual")).toBeNull();
  });

  it("resolves hourly", () => {
    expect(resolveScheduleCron("hourly")).toBe("0 * * * *");
  });

  it("resolves every_6_hours", () => {
    expect(resolveScheduleCron("every_6_hours")).toBe("0 */6 * * *");
  });

  it("resolves daily", () => {
    expect(resolveScheduleCron("daily")).toBe("0 2 * * *");
  });

  it("resolves weekly", () => {
    expect(resolveScheduleCron("weekly")).toBe("0 2 * * 0");
  });
});

describe("resolveScheduleIntervalMs", () => {
  it("returns null for manual", () => {
    expect(resolveScheduleIntervalMs("manual")).toBeNull();
  });

  it("returns one hour in ms for hourly", () => {
    expect(resolveScheduleIntervalMs("hourly")).toBe(60 * 60 * 1000);
  });

  it("returns six hours in ms for every_6_hours", () => {
    expect(resolveScheduleIntervalMs("every_6_hours")).toBe(6 * 60 * 60 * 1000);
  });

  it("returns one day in ms for daily", () => {
    expect(resolveScheduleIntervalMs("daily")).toBe(24 * 60 * 60 * 1000);
  });

  it("returns seven days in ms for weekly", () => {
    expect(resolveScheduleIntervalMs("weekly")).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("createIngestionConfigurationInput", () => {
  const base = {
    customerId: "cust_1",
    infrastructureConfigurationId: "cfg_1",
    connectionId: "conn_1",
    sourceObject: "dbo.Customers",
    destinationLogicalName: "gold",
  };

  it("applies defaults for loadMethod and scheduleFrequency", () => {
    const parsed = createIngestionConfigurationInput.parse(base);
    expect(parsed.loadMethod).toBe("full");
    expect(parsed.scheduleFrequency).toBe("daily");
  });

  it("accepts a full load without a watermark column", () => {
    const parsed = createIngestionConfigurationInput.parse({ ...base, loadMethod: "full" });
    expect(parsed.watermarkColumn).toBeUndefined();
  });

  it("accepts cdc without a watermark column", () => {
    const parsed = createIngestionConfigurationInput.parse({ ...base, loadMethod: "cdc" });
    expect(parsed.loadMethod).toBe("cdc");
  });

  it("rejects incremental without a watermark column", () => {
    expect(() => createIngestionConfigurationInput.parse({ ...base, loadMethod: "incremental" })).toThrow();
  });

  it("accepts incremental with a watermark column", () => {
    const parsed = createIngestionConfigurationInput.parse({
      ...base,
      loadMethod: "incremental",
      watermarkColumn: "UpdatedAt",
    });
    expect(parsed.watermarkColumn).toBe("UpdatedAt");
  });

  it("rejects a missing sourceObject", () => {
    expect(() => createIngestionConfigurationInput.parse({ ...base, sourceObject: "" })).toThrow();
  });

  it("rejects a missing destinationLogicalName", () => {
    const rest: Record<string, unknown> = { ...base };
    delete rest.destinationLogicalName;
    expect(() => createIngestionConfigurationInput.parse(rest)).toThrow();
  });

  it("rejects an unknown loadMethod", () => {
    expect(() => createIngestionConfigurationInput.parse({ ...base, loadMethod: "bogus" })).toThrow();
  });

  it("rejects an unknown scheduleFrequency", () => {
    expect(() => createIngestionConfigurationInput.parse({ ...base, scheduleFrequency: "bogus" })).toThrow();
  });
});
