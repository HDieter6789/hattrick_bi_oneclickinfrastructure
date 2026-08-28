import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit tests for the create_workspace fixed provisioning step
 * (src/services/provisioning/steps/create-workspace.ts). Covers two real
 * bugs found provisioning against a live tenant: (1) a workspace created
 * with no assigned capacity rejects all item creation with a 403
 * "FeatureNotAvailable" — configuration.capacityId must be forwarded to the
 * Fabric create-workspace payload; (2) a workspace created purely by the
 * service principal has no human member at all, so internal staff can't
 * see it in the Fabric portal — FABRIC_INTERNAL_ADMIN_PRINCIPAL_ID must be
 * granted "Admin" afterwards, non-fatally.
 */

const actualResourceFindUnique = vi.fn();
const actualResourceCreate = vi.fn();

vi.mock("@/db/prisma", () => ({
  prisma: {
    actualResource: {
      findUnique: (...args: unknown[]) => actualResourceFindUnique(...args),
      create: (...args: unknown[]) => actualResourceCreate(...args),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  childLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/lib/redact", () => ({
  redactForPersistence: (v: unknown) => v,
}));

const postMock = vi.fn();
vi.mock("@/services/fabric", () => ({
  getFabricApiClient: () => ({ post: (...args: unknown[]) => postMock(...args) }),
  FabricApiException: class FabricApiException extends Error {},
}));

let envOverrides: Record<string, unknown> = {};
vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    FABRIC_INTERNAL_ADMIN_PRINCIPAL_ID: undefined,
    FABRIC_INTERNAL_ADMIN_PRINCIPAL_TYPE: "User",
    ...envOverrides,
  }),
}));

const { createWorkspaceStep } = await import("@/services/provisioning/steps/create-workspace");

function desiredResource(configuration: Record<string, unknown> = {}) {
  return { id: "dr_1", displayName: "acme_prod_ws", configuration } as never;
}

describe("createWorkspaceStep", () => {
  beforeEach(() => {
    actualResourceFindUnique.mockReset();
    actualResourceCreate.mockReset();
    postMock.mockReset();
    envOverrides = {};

    actualResourceFindUnique.mockResolvedValue(null);
    actualResourceCreate.mockResolvedValue({});
  });

  it("forwards configuration.capacityId to the Fabric create-workspace payload", async () => {
    postMock.mockResolvedValueOnce({ status: "Succeeded", result: { id: "ws_1", displayName: "acme_prod_ws" }, error: null });

    await createWorkspaceStep.execute({ desiredResource: desiredResource({ capacityId: "cap_1" }) } as never);

    expect(postMock).toHaveBeenCalledWith(
      "/workspaces",
      expect.objectContaining({ displayName: "acme_prod_ws", capacityId: "cap_1" }),
      expect.anything(),
    );
  });

  it("omits capacityId from the payload when none is configured", async () => {
    postMock.mockResolvedValueOnce({ status: "Succeeded", result: { id: "ws_1", displayName: "acme_prod_ws" }, error: null });

    await createWorkspaceStep.execute({ desiredResource: desiredResource({}) } as never);

    const [, payload] = postMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).not.toHaveProperty("capacityId");
  });

  it("grants FABRIC_INTERNAL_ADMIN_PRINCIPAL_ID Admin access after a successful create", async () => {
    envOverrides = { FABRIC_INTERNAL_ADMIN_PRINCIPAL_ID: "user_1", FABRIC_INTERNAL_ADMIN_PRINCIPAL_TYPE: "User" };
    postMock
      .mockResolvedValueOnce({ status: "Succeeded", result: { id: "ws_1", displayName: "acme_prod_ws" }, error: null })
      .mockResolvedValueOnce({ status: "Succeeded", result: null, error: null });

    const result = await createWorkspaceStep.execute({ desiredResource: desiredResource({}) } as never);

    expect(result.outcome).toBe("succeeded");
    expect(postMock).toHaveBeenCalledTimes(2);
    expect(postMock).toHaveBeenNthCalledWith(2, "/workspaces/ws_1/roleAssignments", {
      principal: { id: "user_1", type: "User" },
      role: "Admin",
    });
  });

  it("does not call roleAssignments when no internal admin principal is configured", async () => {
    postMock.mockResolvedValueOnce({ status: "Succeeded", result: { id: "ws_1", displayName: "acme_prod_ws" }, error: null });

    await createWorkspaceStep.execute({ desiredResource: desiredResource({}) } as never);

    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it("still reports the workspace creation as succeeded even if granting internal admin access fails", async () => {
    envOverrides = { FABRIC_INTERNAL_ADMIN_PRINCIPAL_ID: "user_1", FABRIC_INTERNAL_ADMIN_PRINCIPAL_TYPE: "User" };
    postMock
      .mockResolvedValueOnce({ status: "Succeeded", result: { id: "ws_1", displayName: "acme_prod_ws" }, error: null })
      .mockRejectedValueOnce(new Error("some transient Fabric error"));

    const result = await createWorkspaceStep.execute({ desiredResource: desiredResource({}) } as never);

    expect(result.outcome).toBe("succeeded");
    expect(result.resourceId).toBe("ws_1");
  });
});
