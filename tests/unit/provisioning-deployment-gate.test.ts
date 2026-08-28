import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Exhaustive coverage of createDeployment()'s mandatory appointment gate
 * (src/features/provisioning/service.ts) — the single most
 * security-critical function in the provisioning backend. Every fact it
 * relies on (appointment existence/ownership/status, configuration
 * ownership) must be independently re-derived from the database and never
 * trusted from caller input; this test pins that no combination of a
 * missing, foreign, or unconfirmed appointment can ever reach
 * createDeploymentFromPlan().
 *
 * "server-only" isn't resolvable outside Next's bundler (see
 * src/features/customers/service.ts / this file's sibling for the same
 * pattern), and @/lib/authz transitively imports @/auth (NextAuth config,
 * out of scope here) — both are stubbed so the module under test can be
 * loaded in plain Node/Vitest.
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

// SKIP_APPOINTMENT_GATE must default to false here — these tests exist to
// pin that an unconfirmed appointment is always rejected in the normal
// (non-testing) configuration. See tests/unit/appointment-gate-skip.test.ts
// for coverage of the opposite (flag enabled) case.
vi.mock("@/lib/env", () => ({
  isAppointmentGateSkipped: vi.fn(() => false),
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

describe("createDeployment — mandatory appointment gate", () => {
  beforeEach(() => {
    findUniqueInfraConfig.mockReset();
    findUniqueAppointment.mockReset();
    deploymentUpdate.mockReset();
    configurationVersionFindUnique.mockReset();
    requireCustomerAccessMock.mockReset();
    writeAuditLogMock.mockReset();
    createDeploymentFromPlanMock.mockReset();

    // Happy-path defaults, overridden per test.
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

  it("rejects when infrastructureConfigurationId does not resolve to any configuration", async () => {
    findUniqueInfraConfig.mockResolvedValue(null);

    await expect(createDeployment(baseDraft())).rejects.toThrow(/was not found/i);
    expect(createDeploymentFromPlanMock).not.toHaveBeenCalled();
  });

  it("rejects when the appointment does not exist", async () => {
    findUniqueAppointment.mockResolvedValue(null);

    await expect(createDeployment(baseDraft())).rejects.toThrow(/appointment.*was not found/i);
    expect(createDeploymentFromPlanMock).not.toHaveBeenCalled();
  });

  it("rejects with ForbiddenError when the appointment belongs to a different customer", async () => {
    findUniqueAppointment.mockResolvedValue({
      id: APPOINTMENT_ID,
      customerId: OTHER_CUSTOMER_ID,
      status: "confirmed",
    });

    await expect(createDeployment(baseDraft())).rejects.toThrow(FakeForbiddenError);
    expect(createDeploymentFromPlanMock).not.toHaveBeenCalled();
  });

  it.each(["pending", "cancelled", "completed"] as const)(
    "rejects when the appointment status is %s (not confirmed)",
    async (status) => {
      findUniqueAppointment.mockResolvedValue({ id: APPOINTMENT_ID, customerId: CUSTOMER_ID, status });

      await expect(createDeployment(baseDraft())).rejects.toThrow(/not confirmed/i);
      expect(createDeploymentFromPlanMock).not.toHaveBeenCalled();
    },
  );

  it("succeeds and calls createDeploymentFromPlan exactly once when the appointment is confirmed and owned by the right customer", async () => {
    findUniqueAppointment.mockResolvedValue({ id: APPOINTMENT_ID, customerId: CUSTOMER_ID, status: "confirmed" });

    const deployment = await createDeployment(baseDraft());

    expect(deployment.id).toBe("deploy_1");
    expect(createDeploymentFromPlanMock).toHaveBeenCalledTimes(1);
    expect(createDeploymentFromPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: CUSTOMER_ID,
        infrastructureConfigurationId: CONFIG_ID,
        appointmentId: APPOINTMENT_ID,
        createdById: CREATED_BY_ID,
        resourceParameterOverrides: {},
      }),
    );
    expect(requireCustomerAccessMock).toHaveBeenCalledWith(CUSTOMER_ID);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "deployment.create", customerId: CUSTOMER_ID, deploymentId: "deploy_1" }),
    );
  });

  it("still enforces the gate even if a caller tries to smuggle a customerId in the draft (it is ignored/parsed away)", async () => {
    findUniqueAppointment.mockResolvedValue({ id: APPOINTMENT_ID, customerId: OTHER_CUSTOMER_ID, status: "confirmed" });

    // A spoofed customerId in the draft must not influence which customer
    // is checked against — the configuration row is the only source of
    // truth, and the appointment belongs to a DIFFERENT customer than that
    // configuration, so this must still be rejected.
    await expect(
      createDeployment({ ...baseDraft(), customerId: CUSTOMER_ID } as never),
    ).rejects.toThrow(FakeForbiddenError);
  });

  it("applies a non-default rollbackPolicy with a follow-up update after creation", async () => {
    findUniqueAppointment.mockResolvedValue({ id: APPOINTMENT_ID, customerId: CUSTOMER_ID, status: "confirmed" });
    deploymentUpdate.mockResolvedValue({
      id: "deploy_1",
      customerId: CUSTOMER_ID,
      rollbackPolicy: "ROLLBACK_CREATED_RESOURCES",
      desiredResources: [],
    });

    const deployment = await createDeployment({ ...baseDraft(), rollbackPolicy: "ROLLBACK_CREATED_RESOURCES" });

    expect(deploymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "deploy_1" }, data: { rollbackPolicy: "ROLLBACK_CREATED_RESOURCES" } }),
    );
    expect(deployment.rollbackPolicy).toBe("ROLLBACK_CREATED_RESOURCES");
  });
});
