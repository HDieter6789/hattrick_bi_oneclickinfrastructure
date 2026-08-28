import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit tests for the health_validation fixed provisioning step
 * (src/services/provisioning/steps/health-validation.ts) — the explicit,
 * auditable checkpoint required between resource creation and
 * customer-facing steps (Access Configuration, Welcome Email). Prisma is
 * mocked following the same pattern as
 * tests/unit/provisioning-deployment-gate.test.ts.
 */

const desiredResourceFindMany = vi.fn();
const sqlEndpointFindMany = vi.fn();

vi.mock("@/db/prisma", () => ({
  prisma: {
    desiredResource: {
      findMany: (...args: unknown[]) => desiredResourceFindMany(...args),
    },
    sqlEndpoint: {
      findMany: (...args: unknown[]) => sqlEndpointFindMany(...args),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  childLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { healthValidationStep } = await import("@/services/provisioning/steps/health-validation");

const DEPLOYMENT_ID = "deploy_1";
const CUSTOMER_ID = "cust_1";

function deployment() {
  return { id: DEPLOYMENT_ID, customerId: CUSTOMER_ID } as never;
}

function healthyResource(logicalName: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `dr_${logicalName}`,
    logicalName,
    status: "succeeded",
    actualResource: {
      fabricWorkspaceId: "ws_1",
      fabricItemId: `item_${logicalName}`,
      fabricItemType: "Lakehouse",
      provisioningStatus: "active",
    },
    ...overrides,
  };
}

describe("healthValidationStep", () => {
  beforeEach(() => {
    desiredResourceFindMany.mockReset();
    sqlEndpointFindMany.mockReset();
    sqlEndpointFindMany.mockResolvedValue([]);
  });

  it("succeeds when every non-skipped resource succeeded and its ActualResource is active/provisioning", async () => {
    desiredResourceFindMany.mockResolvedValue([
      healthyResource("workspace"),
      healthyResource("gold_lakehouse"),
    ]);

    const result = await healthValidationStep.execute({ deployment: deployment(), correlationId: "corr_1" });

    expect(result.outcome).toBe("succeeded");
  });

  it("ignores skipped resources (blocked by a failed dependency) rather than reporting them as unhealthy", async () => {
    desiredResourceFindMany.mockResolvedValue([
      healthyResource("workspace"),
      { id: "dr_pipeline", logicalName: "pipeline", status: "skipped", actualResource: null },
    ]);

    const result = await healthValidationStep.execute({ deployment: deployment(), correlationId: "corr_1" });

    expect(result.outcome).toBe("succeeded");
  });

  it("fails when a non-skipped resource's status is not succeeded", async () => {
    desiredResourceFindMany.mockResolvedValue([
      healthyResource("workspace"),
      { id: "dr_bad", logicalName: "silver_lakehouse", status: "failed", actualResource: null },
    ]);

    const result = await healthValidationStep.execute({ deployment: deployment(), correlationId: "corr_1" });

    expect(result.outcome).toBe("failed");
    expect(result.errorCode).toBe("HEALTH_CHECK_FAILED");
    expect(result.errorMessage).toContain("silver_lakehouse");
  });

  it("fails when a succeeded resource has no ActualResource", async () => {
    desiredResourceFindMany.mockResolvedValue([
      { id: "dr_x", logicalName: "gold_lakehouse", status: "succeeded", actualResource: null },
    ]);

    const result = await healthValidationStep.execute({ deployment: deployment(), correlationId: "corr_1" });

    expect(result.outcome).toBe("failed");
    expect(result.errorMessage).toContain("no associated ActualResource");
  });

  it("fails when an ActualResource's provisioningStatus is degraded/failed/deleted", async () => {
    for (const badStatus of ["degraded", "failed", "deleted"]) {
      desiredResourceFindMany.mockResolvedValue([healthyResource("gold_lakehouse", { actualResource: { fabricWorkspaceId: "ws_1", fabricItemId: "item_gold_lakehouse", fabricItemType: "Lakehouse", provisioningStatus: badStatus } })]);

      const result = await healthValidationStep.execute({ deployment: deployment(), correlationId: "corr_1" });

      expect(result.outcome).toBe("failed");
      expect(result.errorMessage).toContain(badStatus);
    }
  });

  it("fails when a SqlEndpoint correlated to a Lakehouse created in this deployment has provisioningStatus Failed", async () => {
    desiredResourceFindMany.mockResolvedValue([healthyResource("gold_lakehouse")]);
    sqlEndpointFindMany.mockResolvedValue([
      { id: "sql_1", fabricLakehouseId: "item_gold_lakehouse", provisioningStatus: "Failed" },
    ]);

    const result = await healthValidationStep.execute({ deployment: deployment(), correlationId: "corr_1" });

    expect(result.outcome).toBe("failed");
    expect(result.errorMessage).toContain("SQL analytics endpoint");
    expect(sqlEndpointFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customerId: CUSTOMER_ID, fabricLakehouseId: { in: ["item_gold_lakehouse"] } }),
      }),
    );
  });

  it("passes when a correlated SqlEndpoint is InProgress or Success (not Failed)", async () => {
    desiredResourceFindMany.mockResolvedValue([healthyResource("gold_lakehouse")]);
    sqlEndpointFindMany.mockResolvedValue([
      { id: "sql_1", fabricLakehouseId: "item_gold_lakehouse", provisioningStatus: "Success" },
    ]);

    const result = await healthValidationStep.execute({ deployment: deployment(), correlationId: "corr_1" });

    expect(result.outcome).toBe("succeeded");
  });

  it("does not query SqlEndpoint at all when no Lakehouse ActualResource exists in this deployment", async () => {
    desiredResourceFindMany.mockResolvedValue([
      {
        id: "dr_ws",
        logicalName: "workspace",
        status: "succeeded",
        actualResource: { fabricWorkspaceId: "ws_1", fabricItemId: "ws_1", fabricItemType: "Workspace", provisioningStatus: "active" },
      },
    ]);

    const result = await healthValidationStep.execute({ deployment: deployment(), correlationId: "corr_1" });

    expect(result.outcome).toBe("succeeded");
    expect(sqlEndpointFindMany).not.toHaveBeenCalled();
  });
});
