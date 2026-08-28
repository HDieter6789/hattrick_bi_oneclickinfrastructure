import { describe, expect, it } from "vitest";
import { computeConnectionsStatus, computeReportsStatus, computeServiceStatus, type RecurringJobFact } from "@/services/monitoring/status";

const NOW = new Date("2026-08-27T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function fact(overrides: Partial<RecurringJobFact>): RecurringJobFact {
  return {
    lastRunStatus: "succeeded",
    lastRunAttempts: 1,
    lastRunFinishedAt: NOW,
    expectedIntervalMs: null,
    ...overrides,
  };
}

describe("computeServiceStatus", () => {
  describe("RED cases", () => {
    it("is RED when no run has ever completed", () => {
      const result = computeServiceStatus({ now: NOW, fact: fact({ lastRunStatus: null, lastRunFinishedAt: null }) });
      expect(result.status).toBe("RED");
    });

    it("is RED when the most recent run failed", () => {
      const result = computeServiceStatus({ now: NOW, fact: fact({ lastRunStatus: "failed" }) });
      expect(result.status).toBe("RED");
    });

    it("is RED when more than 2x the expected interval has passed since the last success", () => {
      const result = computeServiceStatus({
        now: NOW,
        fact: fact({ lastRunFinishedAt: new Date(NOW.getTime() - 3 * DAY), expectedIntervalMs: DAY }),
      });
      expect(result.status).toBe("RED");
    });

    it("treats a failed run as RED even if it is also overdue by more than 2x", () => {
      const result = computeServiceStatus({
        now: NOW,
        fact: fact({ lastRunStatus: "failed", lastRunFinishedAt: new Date(NOW.getTime() - 3 * DAY), expectedIntervalMs: DAY }),
      });
      expect(result.status).toBe("RED");
    });
  });

  describe("YELLOW cases", () => {
    it("is YELLOW when the last run succeeded but required a retry", () => {
      const result = computeServiceStatus({ now: NOW, fact: fact({ lastRunAttempts: 2 }) });
      expect(result.status).toBe("YELLOW");
    });

    it("is YELLOW when overdue but not yet past the 2x threshold", () => {
      const result = computeServiceStatus({
        now: NOW,
        fact: fact({ lastRunFinishedAt: new Date(NOW.getTime() - 1.5 * DAY), expectedIntervalMs: DAY }),
      });
      expect(result.status).toBe("YELLOW");
    });
  });

  describe("GREEN cases", () => {
    it("is GREEN when the last run succeeded on the first try with no schedule expectation", () => {
      const result = computeServiceStatus({ now: NOW, fact: fact({}) });
      expect(result.status).toBe("GREEN");
    });

    it("is GREEN when the last run is within its expected interval", () => {
      const result = computeServiceStatus({
        now: NOW,
        fact: fact({ lastRunFinishedAt: new Date(NOW.getTime() - HOUR), expectedIntervalMs: DAY }),
      });
      expect(result.status).toBe("GREEN");
    });

    it("is GREEN exactly at the expected interval boundary (not yet overdue)", () => {
      const result = computeServiceStatus({
        now: NOW,
        fact: fact({ lastRunFinishedAt: new Date(NOW.getTime() - DAY), expectedIntervalMs: DAY }),
      });
      expect(result.status).toBe("GREEN");
    });
  });
});

describe("computeConnectionsStatus", () => {
  it("is GREEN when there are no connections configured", () => {
    expect(computeConnectionsStatus([]).status).toBe("GREEN");
  });

  it("is GREEN when all connections are healthy", () => {
    expect(computeConnectionsStatus([{ health: "healthy" }, { health: "healthy" }]).status).toBe("GREEN");
  });

  it("is YELLOW when a connection is degraded", () => {
    expect(computeConnectionsStatus([{ health: "healthy" }, { health: "degraded" }]).status).toBe("YELLOW");
  });

  it("is RED when a connection has failed", () => {
    expect(computeConnectionsStatus([{ health: "healthy" }, { health: "failed" }]).status).toBe("RED");
  });

  it("failed outranks degraded", () => {
    expect(computeConnectionsStatus([{ health: "degraded" }, { health: "failed" }]).status).toBe("RED");
  });
});

describe("computeReportsStatus", () => {
  it("is GREEN when no reports are provisioned", () => {
    expect(computeReportsStatus([]).status).toBe("GREEN");
  });

  it("is GREEN when all reports are active", () => {
    expect(computeReportsStatus([{ provisioningStatus: "active" }]).status).toBe("GREEN");
  });

  it("is YELLOW when a report is still provisioning", () => {
    expect(computeReportsStatus([{ provisioningStatus: "provisioning" }]).status).toBe("YELLOW");
  });

  it("is RED when a report failed to provision", () => {
    expect(computeReportsStatus([{ provisioningStatus: "failed" }]).status).toBe("RED");
  });
});
