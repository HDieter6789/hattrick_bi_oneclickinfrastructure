import { prisma } from "@/db/prisma";
import { childLogger } from "@/lib/logger";
import { getFabricApiClient, FabricApiException } from "@/services/fabric";
import { getSecretProvider } from "@/services/secrets";
import type { Connection } from "@/generated/prisma/client";
import type { ConnectionAuthMethod } from "@/generated/prisma/enums";

const log = childLogger({ module: "connections.fabric-connection-service" });

interface FabricConnectionParameter {
  dataType: "Text" | "Number" | "Boolean";
  name: string;
  value: unknown;
}

/** Fabric's `POST /v1/connections` `credentialDetails.credentials` shape
 * varies by credential type (see docs/FABRIC_API.md). Never logged or
 * persisted as a whole — only non-secret fields are ever surfaced. */
interface FabricCredentialDetails {
  credentialType: string;
  [key: string]: unknown;
}

export function toParameterList(parameters: Record<string, unknown>): FabricConnectionParameter[] {
  return Object.entries(parameters)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([name, value]) => ({
      name,
      value,
      dataType: typeof value === "number" ? "Number" : typeof value === "boolean" ? "Boolean" : "Text",
    }));
}

/**
 * Builds the Fabric `credentialDetails.credentials` object for a given
 * `ConnectionAuthMethod`. This is the ONE place that maps our auth-method
 * enum to Fabric's per-credential-type payload shape — no per-connector
 * branching, since the shape only depends on the auth method, not the
 * connector type.
 */
export function buildCredentialDetails(
  authMethod: ConnectionAuthMethod,
  secretValue: string | undefined,
  parameters: Record<string, unknown>,
): FabricCredentialDetails {
  switch (authMethod) {
    case "UsernamePassword":
      return { credentialType: "Basic", username: parameters.username, password: secretValue };
    case "Windows":
      return { credentialType: "Windows", username: parameters.username, password: secretValue, useCallerAADIdentity: false };
    case "WindowsWithoutImpersonation":
      return { credentialType: "Windows", username: parameters.username, password: secretValue, useCallerAADIdentity: true };
    case "ServicePrincipal":
      return {
        credentialType: "ServicePrincipal",
        servicePrincipalClientId: parameters.clientId,
        servicePrincipalSecret: secretValue,
        tenantId: parameters.tenantId,
      };
    case "APIKey":
    case "Key":
      return { credentialType: "Key", key: secretValue };
    case "AccountKey":
      return { credentialType: "Key", key: secretValue };
    case "SAS":
    case "SharedAccessSignature":
      return { credentialType: "SharedAccessSignature", token: secretValue };
    case "KeyPair":
      return { credentialType: "KeyPair", privateKey: secretValue, passphrase: parameters.passphrase };
    case "OAuth2":
    case "OrganizationalAccount":
      // The access/refresh token resolved via OAuthConnectionService is
      // stored through the same SecretProvider as every other credential.
      return { credentialType: "OAuth2", ...(secretValue ? { accessToken: secretValue } : {}) };
    case "WorkspaceIdentity":
      return { credentialType: "WorkspaceIdentity" };
    case "Gateway":
      // Gateway auth is carried by `connectivityType`/`gatewayId`, not the
      // credential type — the on-prem gateway holds the real credential.
      return { credentialType: "Anonymous" };
    case "Anonymous":
    default:
      return { credentialType: "Anonymous" };
  }
}

/**
 * Creates the Fabric-side connection for a `Connection` row via
 * `POST /v1/connections`, resolving its secret through `SecretProvider` and
 * never persisting it. Idempotent in the same spirit as
 * services/provisioning/steps/create-fabric-item.ts: if `fabricConnectionId`
 * is already set, the connection already exists in Fabric — skip.
 */
export class FabricConnectionService {
  async createFabricConnection(connectionId: string, correlationId?: string): Promise<Connection> {
    const connection = await prisma.connection.findUniqueOrThrow({
      where: { id: connectionId },
      include: { connector: true, secretReferences: true },
    });

    if (connection.fabricConnectionId) {
      log.info({ connectionId, fabricConnectionId: connection.fabricConnectionId }, "Fabric connection already exists — skipping create");
      return connection;
    }

    const secretRef = connection.secretReferences[0];
    const secretValue = secretRef ? await getSecretProvider().getSecret(secretRef.secretReference) : undefined;
    const parameters = (connection.parametersJson ?? {}) as Record<string, unknown>;

    const connectionDetails = {
      type: connection.connectorTypeKey,
      creationMethod: connection.connectorTypeKey,
      parameters: toParameterList(parameters),
    };

    const payload = {
      connectivityType: connection.connector.gatewayRequired ? "OnPremisesGateway" : "ShareableCloud",
      displayName: connection.displayName,
      connectionDetails,
      credentialDetails: {
        credentials: buildCredentialDetails(connection.authMethod, secretValue, parameters),
        singleSignOnType: "None",
        connectionEncryption: "Encrypted",
        skipTestConnection: false,
      },
    };

    const client = getFabricApiClient();
    try {
      const response = await client.post<{ id: string }>("/connections", payload, { correlationId });

      if (response.status !== "Succeeded" || !response.result) {
        await prisma.connection.update({ where: { id: connectionId }, data: { status: "error", health: "failed" } });
        // Never log response.error.details here — Fabric error bodies can
        // echo back invalid request fields, and credentialDetails is never
        // safe to assume redacted at the message-content level.
        log.error({ connectionId, errorCode: response.error?.errorCode }, "Fabric connection creation did not succeed");
        throw new Error(response.error?.message ?? "Fabric connection creation did not succeed");
      }

      const updated = await prisma.connection.update({
        where: { id: connectionId },
        data: {
          fabricConnectionId: response.result.id,
          status: "connected",
          connectedAt: new Date(),
          lastValidationAt: new Date(),
          health: "healthy",
        },
      });

      log.info({ connectionId, fabricConnectionId: response.result.id, connectorTypeKey: connection.connectorTypeKey }, "Fabric connection created");
      return updated;
    } catch (error) {
      if (error instanceof FabricApiException) {
        await prisma.connection.update({ where: { id: connectionId }, data: { status: "error", health: "failed" } });
        log.error({ connectionId, errorCode: error.errorCode, status: error.status }, "Fabric connection creation failed");
      }
      throw error;
    }
  }

  /** Deletes the Fabric-side connection (if one was ever created) and
   * clears the local link. Does not delete the stored secret — callers
   * that are deleting the `Connection` row entirely are responsible for
   * also calling `SecretProvider.deleteSecret` for each reference. */
  async deleteFabricConnection(connectionId: string, correlationId?: string): Promise<void> {
    const connection = await prisma.connection.findUniqueOrThrow({ where: { id: connectionId } });
    if (!connection.fabricConnectionId) return;

    const client = getFabricApiClient();
    await client.delete(`/connections/${connection.fabricConnectionId}`, { correlationId });
    log.info({ connectionId, fabricConnectionId: connection.fabricConnectionId }, "Fabric connection deleted");
  }
}

export const fabricConnectionService = new FabricConnectionService();
