import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Round-trips src/features/provisioning/service.ts's version-0
 * draft-resource-parameter-overrides workaround: updateConfiguration()
 * upserts a reserved `ConfigurationVersion` row at `version: 0` (since
 * InfrastructureConfiguration has no column for per-resource overrides
 * ahead of finalization — see DRAFT_OVERRIDES_VERSION's doc comment in
 * service.ts), and generateConfigurationPlan() reads it back and forwards
 * it into services/provisioning/planner.ts's generateDeploymentPlan().
 *
 * upsertDraftOverrides/getDraftResourceParameterOverrides are private, so
 * this exercises them indirectly through the two public functions that use
 * them — the same round trip the wizard's Fabric Resources step depends on.
 */
vi.mock("server-only", () => ({}));

const findUniqueOrThrowInfraConfig = vi.fn();
const updateInfraConfig = vi.fn();
const configurationVersionUpsert = vi.fn();
const configurationVersionFindUnique = vi.fn();

vi.mock("@/db/prisma", () => ({
  prisma: {
    infrastructureConfiguration: {
      findUniqueOrThrow: (...args: unknown[]) => findUniqueOrThrowInfraConfig(...args),
      update: (...args: unknown[]) => updateInfraConfig(...args),
    },
    configurationVersion: {
      upsert: (...args: unknown[]) => configurationVersionUpsert(...args),
      findUnique: (...args: unknown[]) => configurationVersionFindUnique(...args),
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

const generateDeploymentPlanMock = vi.fn();
vi.mock("@/services/provisioning/planner", () => ({
  generateDeploymentPlan: (...args: unknown[]) => generateDeploymentPlanMock(...args),
  createDeploymentFromPlan: vi.fn(),
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

const { updateConfiguration, generateConfigurationPlan } = await import("@/features/provisioning/service");

const CONFIG_ID = "config_1";
const CUSTOMER_ID = "cust_1";

describe("draft resource-parameter-overrides round trip (version-0 ConfigurationVersion row)", () => {
  beforeEach(() => {
    findUniqueOrThrowInfraConfig.mockReset();
    updateInfraConfig.mockReset();
    configurationVersionUpsert.mockReset();
    configurationVersionFindUnique.mockReset();
    requireCustomerAccessMock.mockReset();
    writeAuditLogMock.mockReset();
    generateDeploymentPlanMock.mockReset();

    findUniqueOrThrowInfraConfig.mockResolvedValue({ id: CONFIG_ID, customerId: CUSTOMER_ID });
    requireCustomerAccessMock.mockResolvedValue({ userId: "user_1", email: "u@example.com", role: "customer_admin" });
    updateInfraConfig.mockResolvedValue({ id: CONFIG_ID, customerId: CUSTOMER_ID, name: "Updated" });
    generateDeploymentPlanMock.mockResolvedValue({ resources: [], order: [], summary: { total: 0, byType: {} } });
  });

  it("updateConfiguration upserts overrides at version 0 with the exact logicalName -> paramKey -> value shape", async () => {
    const overrides = { gold_lakehouse: { retentionDays: 30 }, bronze_lakehouse: { enableSchemaEvolution: true } };

    await updateConfiguration(CONFIG_ID, { resourceParameterOverrides: overrides });

    expect(configurationVersionUpsert).toHaveBeenCalledTimes(1);
    const call = configurationVersionUpsert.mock.calls[0][0] as {
      where: { infrastructureConfigurationId_version: { infrastructureConfigurationId: string; version: number } };
      create: { snapshotJson: { resourceParameterOverrides: unknown } };
      update: { snapshotJson: { resourceParameterOverrides: unknown } };
    };
    expect(call.where.infrastructureConfigurationId_version).toEqual({
      infrastructureConfigurationId: CONFIG_ID,
      version: 0,
    });
    expect(call.create.snapshotJson.resourceParameterOverrides).toEqual(overrides);
    expect(call.update.snapshotJson.resourceParameterOverrides).toEqual(overrides);
  });

  it("does not touch the version-0 row when no resourceParameterOverrides are supplied", async () => {
    await updateConfiguration(CONFIG_ID, { name: "Renamed" });

    expect(configurationVersionUpsert).not.toHaveBeenCalled();
    expect(updateInfraConfig).toHaveBeenCalledWith(expect.objectContaining({ where: { id: CONFIG_ID } }));
  });

  it("generateConfigurationPlan reads back the saved overrides and forwards them verbatim to generateDeploymentPlan", async () => {
    const overrides = { gold_lakehouse: { retentionDays: 30 } };
    configurationVersionFindUnique.mockResolvedValue({
      infrastructureConfigurationId: CONFIG_ID,
      version: 0,
      snapshotJson: { resourceParameterOverrides: overrides },
    });

    await generateConfigurationPlan(CONFIG_ID);

    expect(configurationVersionFindUnique).toHaveBeenCalledWith({
      where: { infrastructureConfigurationId_version: { infrastructureConfigurationId: CONFIG_ID, version: 0 } },
    });
    expect(generateDeploymentPlanMock).toHaveBeenCalledWith(CONFIG_ID, overrides);
  });

  it("generateConfigurationPlan forwards an empty object when no draft row exists yet", async () => {
    configurationVersionFindUnique.mockResolvedValue(null);

    await generateConfigurationPlan(CONFIG_ID);

    expect(generateDeploymentPlanMock).toHaveBeenCalledWith(CONFIG_ID, {});
  });
});
