import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit tests for the access_configuration fixed provisioning step
 * (src/services/provisioning/steps/access-configuration.ts). Prisma and
 * grantCustomerAccess are mocked following the same pattern as
 * tests/unit/provisioning-deployment-gate.test.ts.
 */

const customerUserFindMany = vi.fn();
const infrastructureConfigurationFindUniqueOrThrow = vi.fn();
const desiredResourceFindFirst = vi.fn();
const customerAccessFindFirst = vi.fn();
const grantCustomerAccessMock = vi.fn();

vi.mock("@/db/prisma", () => ({
  prisma: {
    customerUser: {
      findMany: (...args: unknown[]) => customerUserFindMany(...args),
    },
    infrastructureConfiguration: {
      findUniqueOrThrow: (...args: unknown[]) => infrastructureConfigurationFindUniqueOrThrow(...args),
    },
    desiredResource: {
      findFirst: (...args: unknown[]) => desiredResourceFindFirst(...args),
    },
    customerAccess: {
      findFirst: (...args: unknown[]) => customerAccessFindFirst(...args),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  childLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/services/entra/customer-access-service", () => ({
  grantCustomerAccess: (...args: unknown[]) => grantCustomerAccessMock(...args),
}));

const { accessConfigurationStep } = await import("@/services/provisioning/steps/access-configuration");

const DEPLOYMENT_ID = "deploy_1";
const CUSTOMER_ID = "cust_1";
const CONFIG_ID = "config_1";

function deployment(overrides: Record<string, unknown> = {}) {
  return { id: DEPLOYMENT_ID, customerId: CUSTOMER_ID, infrastructureConfigurationId: CONFIG_ID, ...overrides } as never;
}

function customerUser(userId: string, entraObjectId: string | null = `entra_${userId}`) {
  return {
    id: `cu_${userId}`,
    customerId: CUSTOMER_ID,
    userId,
    user: { id: userId, entraObjectId, email: `${userId}@example.com`, name: userId },
  };
}

describe("accessConfigurationStep", () => {
  beforeEach(() => {
    customerUserFindMany.mockReset();
    infrastructureConfigurationFindUniqueOrThrow.mockReset();
    desiredResourceFindFirst.mockReset();
    customerAccessFindFirst.mockReset();
    grantCustomerAccessMock.mockReset();

    infrastructureConfigurationFindUniqueOrThrow.mockResolvedValue({ id: CONFIG_ID, sqlSelfServiceEnabled: false });
    customerAccessFindFirst.mockResolvedValue(null);
    grantCustomerAccessMock.mockResolvedValue({ id: "access_1", status: "granted" });
  });

  it("returns skipped with no Prisma access work when there are zero CustomerUser rows", async () => {
    customerUserFindMany.mockResolvedValue([]);

    const result = await accessConfigurationStep.execute({ deployment: deployment(), correlationId: "corr_1" });

    expect(result.outcome).toBe("skipped");
    expect(infrastructureConfigurationFindUniqueOrThrow).not.toHaveBeenCalled();
    expect(grantCustomerAccessMock).not.toHaveBeenCalled();
  });

  it("grants portal_access for a fresh CustomerUser with no existing grant", async () => {
    customerUserFindMany.mockResolvedValue([customerUser("user_1")]);

    const result = await accessConfigurationStep.execute({ deployment: deployment(), correlationId: "corr_1" });

    expect(result.outcome).toBe("succeeded");
    expect(grantCustomerAccessMock).toHaveBeenCalledTimes(1);
    expect(grantCustomerAccessMock).toHaveBeenCalledWith({
      customerId: CUSTOMER_ID,
      kind: "portal_access",
      principal: { principalType: "internal_user", userId: "user_1" },
    });
  });

  it("skips granting portal_access again when a granted CustomerAccess row already exists for the resolved principal", async () => {
    customerUserFindMany.mockResolvedValue([customerUser("user_1")]);
    customerAccessFindFirst.mockImplementation(async (args: { where: { kind: string } }) =>
      args.where.kind === "portal_access" ? { id: "existing", status: "granted" } : null,
    );

    const result = await accessConfigurationStep.execute({ deployment: deployment(), correlationId: "corr_1" });

    expect(result.outcome).toBe("succeeded");
    expect(grantCustomerAccessMock).not.toHaveBeenCalled();
  });

  it("also grants sql_read scoped to the deployment's Gold Lakehouse when sqlSelfServiceEnabled is true", async () => {
    customerUserFindMany.mockResolvedValue([customerUser("user_1")]);
    infrastructureConfigurationFindUniqueOrThrow.mockResolvedValue({ id: CONFIG_ID, sqlSelfServiceEnabled: true });
    desiredResourceFindFirst.mockResolvedValue({
      id: "dr_gold",
      logicalName: "gold_lakehouse",
      actualResource: { fabricWorkspaceId: "ws_1", fabricItemId: "item_gold" },
    });

    const result = await accessConfigurationStep.execute({ deployment: deployment(), correlationId: "corr_1" });

    expect(result.outcome).toBe("succeeded");
    expect(desiredResourceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deploymentId: DEPLOYMENT_ID, layer: "gold", type: "Lakehouse" }) }),
    );
    expect(grantCustomerAccessMock).toHaveBeenCalledTimes(2);
    expect(grantCustomerAccessMock).toHaveBeenCalledWith({
      customerId: CUSTOMER_ID,
      kind: "sql_read",
      principal: { principalType: "internal_user", userId: "user_1" },
      fabricWorkspaceId: "ws_1",
      fabricItemId: "item_gold",
    });
  });

  it("does not grant sql_read when sqlSelfServiceEnabled is true but no Gold Lakehouse ActualResource exists yet", async () => {
    customerUserFindMany.mockResolvedValue([customerUser("user_1")]);
    infrastructureConfigurationFindUniqueOrThrow.mockResolvedValue({ id: CONFIG_ID, sqlSelfServiceEnabled: true });
    desiredResourceFindFirst.mockResolvedValue(null);

    const result = await accessConfigurationStep.execute({ deployment: deployment(), correlationId: "corr_1" });

    expect(result.outcome).toBe("succeeded");
    expect(grantCustomerAccessMock).toHaveBeenCalledTimes(1);
    expect(grantCustomerAccessMock).toHaveBeenCalledWith(expect.objectContaining({ kind: "portal_access" }));
  });

  it("treats a per-user resolution failure as non-fatal: continues granting access for other users and still succeeds", async () => {
    customerUserFindMany.mockResolvedValue([customerUser("user_bad", null), customerUser("user_good")]);

    const result = await accessConfigurationStep.execute({ deployment: deployment(), correlationId: "corr_1" });

    expect(result.outcome).toBe("succeeded");
    expect(grantCustomerAccessMock).toHaveBeenCalledTimes(1);
    expect(grantCustomerAccessMock).toHaveBeenCalledWith(expect.objectContaining({ principal: { principalType: "internal_user", userId: "user_good" } }));
  });

  it("treats a grantCustomerAccess rejection as non-fatal for that user and still succeeds if another user's grant works", async () => {
    customerUserFindMany.mockResolvedValue([customerUser("user_1"), customerUser("user_2")]);
    grantCustomerAccessMock.mockImplementation(async (params: { principal: { userId?: string } }) => {
      if (params.principal.userId === "user_1") throw new Error("No Microsoft Entra user found");
      return { id: "access_2", status: "granted" };
    });

    const result = await accessConfigurationStep.execute({ deployment: deployment(), correlationId: "corr_1" });

    expect(result.outcome).toBe("succeeded");
    expect(grantCustomerAccessMock).toHaveBeenCalledTimes(2);
  });

  it("fails the whole step only when every user's grant attempt failed", async () => {
    customerUserFindMany.mockResolvedValue([customerUser("user_1"), customerUser("user_2", null)]);
    grantCustomerAccessMock.mockRejectedValue(new Error("No Microsoft Entra user found"));

    const result = await accessConfigurationStep.execute({ deployment: deployment(), correlationId: "corr_1" });

    expect(result.outcome).toBe("failed");
    expect(result.errorCode).toBe("ACCESS_CONFIGURATION_FAILED");
  });
});
