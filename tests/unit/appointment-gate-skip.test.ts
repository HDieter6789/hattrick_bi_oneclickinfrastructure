import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Covers the SKIP_APPOINTMENT_GATE=true testing escape hatch (src/lib/env.ts)
 * — the mirror image of tests/unit/provisioning-deployment-gate.test.ts,
 * which pins the opposite (flag off) behavior. When the flag is on, an
 * unconfirmed appointment must no longer block createDeployment(), but every
 * other check (configuration exists, appointment exists, appointment
 * belongs to the resolved customer) still applies unchanged.
 */
vi.mock("server-only", () => ({}));

const findUniqueInfraConfig = vi.fn();
const findUniqueAppointment = vi.fn();
const deploymentUpdate = vi.fn();
const configurationVersionFindUnique = vi.fn();

vi.mock("@/db/prisma", () => ({
  prisma: {
    infrastructureConfiguration: {
      findUnique: (...args: unknown[]) => findUniqueInfraConfig(...args),
    },
    appointment: {
      findUnique: (...args: unknown[]) => findUniqueAppointment(...args),
    },
    deployment: {
      update: (...args: unknown[]) => deploymentUpdate(...args),
    },
    configurationVersion: {
      findUnique: (...args: unknown[]) => configurationVersionFindUnique(...args),
    },
  },
}));

class FakeForbiddenError extends Error {
  constructor(message = "Not authorized for this action") {
    super(message);
    this.name = "ForbiddenError";
  }
}
class FakeUnauthorizedError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "UnauthorizedError";
  }
}
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

const createDeploymentFromPlanMock = vi.fn();
vi.mock("@/services/provisioning/planner", () => ({
  generateDeploymentPlan: vi.fn(),
  createDeploymentFromPlan: (...args: unknown[]) => createDeploymentFromPlanMock(...args),
}));

vi.mock("@/services/provisioning/preflight", () => ({
  assertDeploymentReadyToStart: vi.fn(),
}));

vi.mock("@/services/provisioning/engine", () => ({
  runDeployment: vi.fn(),
  cancelDeployment: vi.fn(),
}));

vi.mock("@/services/provisioning/rollback", () => ({
  getRollbackSafety: vi.fn(),
  rollbackDeployment: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  isAppointmentGateSkipped: vi.fn(() => true),
}));

const { createDeployment } = await import("@/features/provisioning/service");

const CUSTOMER_ID = "cust_1";
const OTHER_CUSTOMER_ID = "cust_2";
const CONFIG_ID = "config_1";
const APPOINTMENT_ID = "appt_1";
const CREATED_BY_ID = "user_1";

function baseDraft() {
  return {
    infrastructureConfigurationId: CONFIG_ID,
    appointmentId: APPOINTMENT_ID,
    createdById: CREATED_BY_ID,
  };
}

describe("createDeployment — SKIP_APPOINTMENT_GATE=true", () => {
  beforeEach(() => {
    findUniqueInfraConfig.mockReset();
    findUniqueAppointment.mockReset();
    deploymentUpdate.mockReset();
    configurationVersionFindUnique.mockReset();
    requireCustomerAccessMock.mockReset();
    writeAuditLogMock.mockReset();
    createDeploymentFromPlanMock.mockReset();

    findUniqueInfraConfig.mockResolvedValue({ id: CONFIG_ID, customerId: CUSTOMER_ID });
    requireCustomerAccessMock.mockResolvedValue({ userId: CREATED_BY_ID, email: "u@example.com", role: "customer_admin" });
    configurationVersionFindUnique.mockResolvedValue(null);
    createDeploymentFromPlanMock.mockResolvedValue({
      id: "deploy_1",
      customerId: CUSTOMER_ID,
      rollbackPolicy: "KEEP_SUCCESSFUL_RESOURCES",
      desiredResources: [],
    });
  });

  it.each(["pending", "cancelled", "completed"] as const)(
    "does NOT reject when the appointment status is %s and the flag is on",
    async (status) => {
      findUniqueAppointment.mockResolvedValue({ id: APPOINTMENT_ID, customerId: CUSTOMER_ID, status });

      const deployment = await createDeployment(baseDraft());

      expect(deployment.id).toBe("deploy_1");
      expect(createDeploymentFromPlanMock).toHaveBeenCalledTimes(1);
    },
  );

  it("still rejects when the appointment does not exist", async () => {
    findUniqueAppointment.mockResolvedValue(null);

    await expect(createDeployment(baseDraft())).rejects.toThrow(/appointment.*was not found/i);
    expect(createDeploymentFromPlanMock).not.toHaveBeenCalled();
  });

  it("still rejects with ForbiddenError when the appointment belongs to a different customer", async () => {
    findUniqueAppointment.mockResolvedValue({ id: APPOINTMENT_ID, customerId: OTHER_CUSTOMER_ID, status: "pending" });

    await expect(createDeployment(baseDraft())).rejects.toThrow(FakeForbiddenError);
    expect(createDeploymentFromPlanMock).not.toHaveBeenCalled();
  });
});
