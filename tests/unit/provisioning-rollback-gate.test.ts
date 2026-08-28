import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Covers src/features/provisioning/service.ts's rollbackDeployment(): it
 * pre-checks getRollbackSafety() for every provisioned resource and refuses
 * to run an automatic rollback at all (rather than silently doing a partial
 * one) if any resource needs manual review — see the function's doc
 * comment for why. KEEP_SUCCESSFUL_RESOURCES deployments skip the check
 * entirely since rollbackDeploymentJob() is always a no-op for that policy.
 */
vi.mock("server-only", () => ({}));

const findUniqueOrThrowDeployment = vi.fn();

vi.mock("@/db/prisma", () => ({
  prisma: {
    deployment: {
      findUniqueOrThrow: (...args: unknown[]) => findUniqueOrThrowDeployment(...args),
    },
  },
}));

class FakeForbiddenError extends Error {}
class FakeUnauthorizedError extends Error {}
vi.mock("@/lib/authz", () => ({
  ForbiddenError: FakeForbiddenError,
  UnauthorizedError: FakeUnauthorizedError,
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
  isInternalRole: vi.fn(() => false),
  INTERNAL_ROLES: ["platform_admin", "service_agent", "operations"],
}));

const requireCustomerAccessMock = vi.fn();
vi.mock("@/lib/require-customer-access", () => ({
  requireCustomerAccess: (...args: unknown[]) => requireCustomerAccessMock(...args),
}));

vi.mock("@/lib/logger", () => ({
  childLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const writeAuditLogMock = vi.fn();
vi.mock("@/lib/audit-log", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}));

vi.mock("@/services/provisioning/planner", () => ({
  generateDeploymentPlan: vi.fn(),
  createDeploymentFromPlan: vi.fn(),
}));

vi.mock("@/services/provisioning/preflight", () => ({
  assertDeploymentReadyToStart: vi.fn(),
}));

vi.mock("@/services/provisioning/engine", () => ({
  runDeployment: vi.fn(),
  cancelDeployment: vi.fn(),
}));

const getRollbackSafetyMock = vi.fn();
const rollbackDeploymentJobMock = vi.fn();
vi.mock("@/services/provisioning/rollback", () => ({
  getRollbackSafety: (...args: unknown[]) => getRollbackSafetyMock(...args),
  rollbackDeployment: (...args: unknown[]) => rollbackDeploymentJobMock(...args),
}));

const { rollbackDeployment } = await import("@/features/provisioning/service");

const DEPLOYMENT_ID = "deploy_1";
const CUSTOMER_ID = "cust_1";

function deploymentWith(rollbackPolicy: string, resources: Array<{ logicalName: string; type: string; actualResource: unknown }>) {
  return {
    id: DEPLOYMENT_ID,
    customerId: CUSTOMER_ID,
    rollbackPolicy,
    desiredResources: resources,
  };
}

describe("rollbackDeployment — refuses a partial automatic rollback", () => {
  beforeEach(() => {
    findUniqueOrThrowDeployment.mockReset();
    requireCustomerAccessMock.mockReset();
    writeAuditLogMock.mockReset();
    getRollbackSafetyMock.mockReset();
    rollbackDeploymentJobMock.mockReset();
    requireCustomerAccessMock.mockResolvedValue({ userId: "user_1", email: "u@example.com", role: "customer_admin" });
  });

  it("skips the safety pre-check and delegates straight through for KEEP_SUCCESSFUL_RESOURCES", async () => {
    findUniqueOrThrowDeployment.mockResolvedValue(
      deploymentWith("KEEP_SUCCESSFUL_RESOURCES", [{ logicalName: "gold_lakehouse", type: "Lakehouse", actualResource: { id: "ar_1" } }]),
    );
    rollbackDeploymentJobMock.mockResolvedValue({ deleted: [], requiresManualReview: [] });

    const result = await rollbackDeployment(DEPLOYMENT_ID);

    expect(getRollbackSafetyMock).not.toHaveBeenCalled();
    expect(rollbackDeploymentJobMock).toHaveBeenCalledWith(DEPLOYMENT_ID);
    expect(result).toEqual({ deleted: [], requiresManualReview: [] });
  });

  it("proceeds when every provisioned resource is rollback-safe", async () => {
    findUniqueOrThrowDeployment.mockResolvedValue(
      deploymentWith("ROLLBACK_CREATED_RESOURCES", [
        { logicalName: "pipeline_1", type: "DataPipeline", actualResource: { id: "ar_1" } },
      ]),
    );
    getRollbackSafetyMock.mockResolvedValue({ rollbackSafe: true, manualReviewRequired: false, neverAutoDelete: false });
    rollbackDeploymentJobMock.mockResolvedValue({ deleted: ["pipeline_1"], requiresManualReview: [] });

    const result = await rollbackDeployment(DEPLOYMENT_ID);

    expect(rollbackDeploymentJobMock).toHaveBeenCalledWith(DEPLOYMENT_ID);
    expect(result.deleted).toEqual(["pipeline_1"]);
  });

  it("throws naming the unsafe resource and never calls the rollback job when a resource requires manual review", async () => {
    findUniqueOrThrowDeployment.mockResolvedValue(
      deploymentWith("ROLLBACK_CREATED_RESOURCES", [
        { logicalName: "pipeline_1", type: "DataPipeline", actualResource: { id: "ar_1" } },
        { logicalName: "gold_lakehouse", type: "Lakehouse", actualResource: { id: "ar_2" } },
      ]),
    );
    getRollbackSafetyMock.mockImplementation(async (type: string) =>
      type === "Lakehouse"
        ? { rollbackSafe: false, manualReviewRequired: true, neverAutoDelete: false }
        : { rollbackSafe: true, manualReviewRequired: false, neverAutoDelete: false },
    );

    await expect(rollbackDeployment(DEPLOYMENT_ID)).rejects.toThrow(/gold_lakehouse/);
    expect(rollbackDeploymentJobMock).not.toHaveBeenCalled();
  });

  it("ignores desiredResources that were never actually provisioned (no actualResource)", async () => {
    findUniqueOrThrowDeployment.mockResolvedValue(
      deploymentWith("ROLLBACK_CREATED_RESOURCES", [{ logicalName: "skipped_resource", type: "Lakehouse", actualResource: null }]),
    );
    rollbackDeploymentJobMock.mockResolvedValue({ deleted: [], requiresManualReview: [] });

    await rollbackDeployment(DEPLOYMENT_ID);

    expect(getRollbackSafetyMock).not.toHaveBeenCalled();
    expect(rollbackDeploymentJobMock).toHaveBeenCalledWith(DEPLOYMENT_ID);
  });
});
