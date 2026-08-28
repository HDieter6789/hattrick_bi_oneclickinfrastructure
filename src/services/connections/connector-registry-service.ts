import { prisma } from "@/db/prisma";
import { childLogger } from "@/lib/logger";
import { getFabricApiClient } from "@/services/fabric";
import type { ConnectorMetadata, Prisma } from "@/generated/prisma/client";
import type { ConnectorCategory } from "@/generated/prisma/enums";

const log = childLogger({ module: "connections.connector-registry" });

/**
 * Loose shape of one entry from Fabric's
 * `GET /v1/connections/supportedConnectionTypes` — see docs/FABRIC_API.md.
 * Kept intentionally permissive (only the fields this app persists are
 * read) since Fabric documents this as a growing, versioned catalog whose
 * exact field set can change; unknown fields are ignored rather than
 * causing a sync failure.
 */
interface FabricSupportedConnectionType {
  type: string;
  creationMethods?: unknown[];
  supportedCredentialTypes?: unknown[];
  gatewayRequired?: boolean;
}

/**
 * Our own UI grouping for connectors — Fabric's catalog does not return a
 * "category" field, so this is maintained here. Unknown connector type
 * keys fall back to `other`, which is exactly what a newly-added Fabric
 * connector type will do until this map (or an admin override) is updated
 * — the sync never fails or hides a connector it doesn't recognize.
 */
const CATEGORY_BY_CONNECTOR_TYPE: Record<string, ConnectorCategory> = {
  AzureSQL: "microsoft",
  OneLake: "microsoft",
  SharePointOnlineList: "microsoft",
  SharePointOnlineFiles: "microsoft",
  Dynamics365: "microsoft",
  DynamicsAX: "microsoft",
  DynamicsCRM: "microsoft",
  SQLServer: "databases",
  PostgreSql: "databases",
  MySql: "databases",
  Oracle: "databases",
  Snowflake: "databases",
  AzureDataLakeStorage: "cloud_storage",
  AzureBlobStorage: "cloud_storage",
  AmazonS3: "cloud_storage",
  GoogleCloudStorage: "cloud_storage",
  Salesforce: "saas",
  SalesforceObjects: "saas",
  ServiceNow: "saas",
  Workday: "saas",
  Folder: "files",
  SharePointFolder: "files",
  Ftp: "files",
  Sftp: "files",
  Web: "web",
  Odata: "web",
  RestApi: "web",
  GoogleAnalytics: "analytics",
  AdobeAnalytics: "analytics",
  SapHana: "erp",
  SapBw: "erp",
  Sap: "erp",
  Dynamics365CRM: "crm",
  Hubspot: "crm",
};

/**
 * Fabric's raw `credentialType` strings (e.g. "Basic", "Key") don't share a
 * vocabulary with our own `ConnectionAuthMethod` enum (e.g.
 * "UsernamePassword") that the generic `ConnectionAuthForm` switches on.
 * Normalizing at sync time means every consumer downstream — seeded demo
 * data included — only ever deals with one vocabulary. Unrecognized raw
 * values are dropped (with a debug log) rather than guessed at.
 */
const CREDENTIAL_TYPE_TO_AUTH_METHOD: Record<string, string> = {
  Basic: "UsernamePassword",
  Key: "Key",
  ApiKey: "APIKey",
  OAuth2: "OAuth2",
  ServicePrincipal: "ServicePrincipal",
  Windows: "Windows",
  WindowsWithoutImpersonation: "WindowsWithoutImpersonation",
  Anonymous: "Anonymous",
  SharedAccessSignature: "SharedAccessSignature",
  AccountKey: "AccountKey",
  WorkspaceIdentity: "WorkspaceIdentity",
  OrganizationalAccount: "OrganizationalAccount",
  KeyPair: "KeyPair",
};

function normalizeCredentialTypes(raw: unknown[] | undefined, connectionTypeKey: string): string[] {
  const normalized: string[] = [];
  for (const entry of raw ?? []) {
    const key = typeof entry === "string" ? entry : (entry as { credentialType?: string } | null)?.credentialType;
    if (!key) continue;
    const mapped = CREDENTIAL_TYPE_TO_AUTH_METHOD[key];
    if (mapped) {
      normalized.push(mapped);
    } else {
      log.debug({ connectionTypeKey, unrecognizedCredentialType: key }, "Skipping unrecognized Fabric credential type during sync");
    }
  }
  return normalized;
}

export type ConnectorSummary = ConnectorMetadata;

/**
 * Single source of truth for "what connectors OneClick can create a Fabric
 * connection for". Nothing in the UI hardcodes a connector-specific form —
 * every consumer (ConnectorCatalog, ConnectionAuthForm, create-connection
 * validation) reads `creationMethodsJson`/`supportedCredentialTypesJson`
 * from this registry, the same "dynamic parameter" philosophy as
 * FabricCapabilityRegistryService.
 */
export class ConnectorRegistryService {
  /** Syncs the catalog from the live Fabric tenant. Requires real Fabric
   * access (not meaningful against the in-memory mock client, which has no
   * seeded connector data) — see prisma/seed/connectors.ts for the catalog
   * used in DEMO_MODE. */
  async syncConnectorCatalog(): Promise<{ synced: number }> {
    const client = getFabricApiClient();
    const types = await client.getAllPages<FabricSupportedConnectionType>("/connections/supportedConnectionTypes");

    for (const type of types) {
      if (!type.type) continue;
      const category = CATEGORY_BY_CONNECTOR_TYPE[type.type] ?? "other";
      const data = {
        displayName: type.type,
        category,
        creationMethodsJson: (type.creationMethods ?? []) as Prisma.InputJsonValue,
        supportedCredentialTypesJson: normalizeCredentialTypes(type.supportedCredentialTypes, type.type) as Prisma.InputJsonValue,
        gatewayRequired: Boolean(type.gatewayRequired),
        lastSyncedAt: new Date(),
      };
      await prisma.connectorMetadata.upsert({
        where: { connectionTypeKey: type.type },
        create: { connectionTypeKey: type.type, ...data },
        update: data,
      });
    }

    log.info({ count: types.length }, "Connector catalog synced from Fabric");
    return { synced: types.length };
  }

  async getConnectors(category?: ConnectorCategory): Promise<ConnectorSummary[]> {
    return prisma.connectorMetadata.findMany({
      where: { enabled: true, category },
      orderBy: { displayName: "asc" },
    });
  }

  async getConnector(connectionTypeKey: string): Promise<ConnectorSummary | null> {
    return prisma.connectorMetadata.findUnique({ where: { connectionTypeKey } });
  }
}

export const connectorRegistry = new ConnectorRegistryService();
