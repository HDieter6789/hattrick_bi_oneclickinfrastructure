import { describe, expect, it, vi, beforeEach } from "vitest";

const findUniqueOrThrow = vi.fn();
const update = vi.fn();
const post = vi.fn();
const getSecret = vi.fn();

vi.mock("@/db/prisma", () => ({
  prisma: {
    connection: {
      findUniqueOrThrow: (...args: unknown[]) => findUniqueOrThrow(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

vi.mock("@/services/fabric", () => ({
  getFabricApiClient: () => ({ post: (...args: unknown[]) => post(...args) }),
  FabricApiException: class FabricApiException extends Error {},
}));

vi.mock("@/services/secrets", () => ({
  getSecretProvider: () => ({ getSecret: (...args: unknown[]) => getSecret(...args) }),
}));

const { FabricConnectionService, buildCredentialDetails, toParameterList } = await import(
  "@/services/connections/fabric-connection-service"
);

describe("buildCredentialDetails", () => {
  it("maps UsernamePassword to a Basic credential", () => {
    expect(buildCredentialDetails("UsernamePassword", "hunter2", { username: "alice" })).toEqual({
      credentialType: "Basic",
      username: "alice",
      password: "hunter2",
    });
  });

  it("maps ServicePrincipal to servicePrincipal fields, never echoing the secret under a generic key", () => {
    const result = buildCredentialDetails("ServicePrincipal", "sp-secret", { clientId: "client-1", tenantId: "tenant-1" });
    expect(result).toEqual({
      credentialType: "ServicePrincipal",
      servicePrincipalClientId: "client-1",
      servicePrincipalSecret: "sp-secret",
      tenantId: "tenant-1",
    });
  });

  it("maps Anonymous to an Anonymous credential with no secret field at all", () => {
    expect(buildCredentialDetails("Anonymous", undefined, {})).toEqual({ credentialType: "Anonymous" });
  });

  it("maps WorkspaceIdentity to a credential with no secret field", () => {
    const result = buildCredentialDetails("WorkspaceIdentity", undefined, {});
    expect(result).toEqual({ credentialType: "WorkspaceIdentity" });
    expect(result).not.toHaveProperty("password");
    expect(result).not.toHaveProperty("key");
  });

  it("maps SAS/SharedAccessSignature to a token field", () => {
    expect(buildCredentialDetails("SAS", "sas-token-value", {})).toEqual({
      credentialType: "SharedAccessSignature",
      token: "sas-token-value",
    });
  });

  it("maps Gateway to Anonymous (the on-prem gateway holds the real credential)", () => {
    expect(buildCredentialDetails("Gateway", undefined, {})).toEqual({ credentialType: "Anonymous" });
  });

  it("does not require a secret for OAuth2 (token is attached later via the Connect flow)", () => {
    expect(buildCredentialDetails("OAuth2", undefined, {})).toEqual({ credentialType: "OAuth2" });
  });
});

describe("toParameterList", () => {
  it("infers dataType per value and drops empty/undefined entries", () => {
    const result = toParameterList({ server: "sql.example.com", port: 1433, ssl: true, empty: "", missing: undefined });
    expect(result).toEqual(
      expect.arrayContaining([
        { name: "server", value: "sql.example.com", dataType: "Text" },
        { name: "port", value: 1433, dataType: "Number" },
        { name: "ssl", value: true, dataType: "Boolean" },
      ]),
    );
    expect(result.find((p) => p.name === "empty")).toBeUndefined();
    expect(result.find((p) => p.name === "missing")).toBeUndefined();
  });
});

describe("FabricConnectionService.createFabricConnection idempotency", () => {
  beforeEach(() => {
    findUniqueOrThrow.mockReset();
    update.mockReset();
    post.mockReset();
    getSecret.mockReset();
  });

  it("skips the Fabric API call entirely when fabricConnectionId is already set", async () => {
    findUniqueOrThrow.mockResolvedValue({
      id: "conn_1",
      fabricConnectionId: "fabric-conn-existing",
      connector: { gatewayRequired: false },
      secretReferences: [],
    });

    const service = new FabricConnectionService();
    const result = await service.createFabricConnection("conn_1");

    expect(result.fabricConnectionId).toBe("fabric-conn-existing");
    expect(post).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("calls Fabric and persists fabricConnectionId when none exists yet", async () => {
    findUniqueOrThrow.mockResolvedValue({
      id: "conn_2",
      customerId: "cust_1",
      connectorTypeKey: "PostgreSql",
      displayName: "My Postgres",
      authMethod: "UsernamePassword",
      fabricConnectionId: null,
      parametersJson: { server: "db.example.com", username: "alice" },
      connector: { gatewayRequired: false },
      secretReferences: [{ secretReference: "mock-secret://cust_1/conn_2/abc" }],
    });
    getSecret.mockResolvedValue("hunter2");
    post.mockResolvedValue({ status: "Succeeded", result: { id: "fabric-conn-new" }, error: null, operationId: null });
    update.mockResolvedValue({ id: "conn_2", fabricConnectionId: "fabric-conn-new" });

    const service = new FabricConnectionService();
    await service.createFabricConnection("conn_2");

    expect(getSecret).toHaveBeenCalledWith("mock-secret://cust_1/conn_2/abc");
    expect(post).toHaveBeenCalledTimes(1);
    const [path, payload] = post.mock.calls[0] as [string, { connectionDetails: unknown; credentialDetails: { credentials: { password?: string } } }];
    expect(path).toBe("/connections");
    // The secret must appear ONLY inside credentialDetails.credentials, and
    // never anywhere else in the request payload (e.g. echoed into
    // connectionDetails.parameters).
    expect(JSON.stringify(payload.connectionDetails)).not.toContain("hunter2");
    expect(payload.credentialDetails.credentials.password).toBe("hunter2");

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conn_2" },
        data: expect.objectContaining({ fabricConnectionId: "fabric-conn-new", status: "connected" }),
      }),
    );
  });

  it("uses the connector's Fabric creation-method name, not connectorTypeKey, when they differ", async () => {
    // Regression test: sending connectorTypeKey as `creationMethod` when
    // Fabric's real creation-method name differs (e.g. Snowflake's `type`
    // is "Snowflake" but its creationMethod is "Snowflake.Databases", per a
    // live tenant's supportedConnectionTypes — see
    // prisma/seed/connectors.ts) produces a real Fabric 400
    // InvalidConnectionDetails.
    findUniqueOrThrow.mockResolvedValue({
      id: "conn_3",
      customerId: "cust_1",
      connectorTypeKey: "Snowflake",
      displayName: "My Snowflake",
      authMethod: "UsernamePassword",
      fabricConnectionId: null,
      parametersJson: { server: "acme.snowflakecomputing.com", warehouse: "COMPUTE_WH" },
      connector: {
        gatewayRequired: false,
        creationMethodsJson: [{ name: "Snowflake.Databases", parameters: [{ name: "server" }, { name: "warehouse" }] }],
      },
      secretReferences: [],
    });
    post.mockResolvedValue({ status: "Succeeded", result: { id: "fabric-conn-snowflake" }, error: null, operationId: null });
    update.mockResolvedValue({ id: "conn_3", fabricConnectionId: "fabric-conn-snowflake" });

    const service = new FabricConnectionService();
    await service.createFabricConnection("conn_3");

    const [, payload] = post.mock.calls[0] as [string, { connectionDetails: { type: string; creationMethod: string } }];
    expect(payload.connectionDetails.type).toBe("Snowflake");
    expect(payload.connectionDetails.creationMethod).toBe("Snowflake.Databases");
  });
});
