/**
 * Seed inventory of the Fabric connector catalog, standing in for
 * `ConnectorRegistryService.syncConnectorCatalog()` (which requires a real
 * Fabric tenant — see services/connections/connector-registry-service.ts)
 * so DEMO_MODE has a realistic, browsable Connections Hub without one.
 *
 * `authMethods` uses our own `ConnectionAuthMethod` vocabulary directly
 * (the same normalized vocabulary `syncConnectorCatalog()` produces from
 * Fabric's raw credential type strings — see
 * CREDENTIAL_TYPE_TO_AUTH_METHOD in connector-registry-service.ts), so
 * seeded and synced data are shaped identically for every downstream
 * consumer (ConnectorCatalog, ConnectionAuthForm).
 *
 * Every entry below (`connectionTypeKey`, `creationMethods[].name`,
 * parameters, `authMethods`) was verified against a live tenant's
 * `GET /v1/connections/supportedConnectionTypes` response, not guessed from
 * older Power Query/Data Factory naming conventions — several entries
 * (e.g. Azure Blob Storage's real type is "AzureBlobs", not
 * "AzureBlobStorage") differ from what those older conventions would
 * suggest and caused real `400 InvalidConnectionDetails` responses before
 * being corrected here. See docs/CONNECTORS.md.
 *
 * Covers every category in the brief (Microsoft, Databases, Cloud Storage,
 * SaaS, Files, Web, Analytics, ERP, CRM) plus every connector explicitly
 * named in the brief. Three (Folder, SAP HANA, HubSpot) had no verifiable
 * match in the live tenant's supported-types response — per the "don't fake
 * support" rule they're seeded `enabled: false` rather than presented as
 * working.
 */

export interface ConnectorSeedParameter {
  name: string;
  dataType: "Text" | "Number" | "Boolean";
  required: boolean;
  description?: string;
}

export interface ConnectorSeedCreationMethod {
  name: string;
  parameters: ConnectorSeedParameter[];
}

export interface ConnectorSeed {
  connectionTypeKey: string;
  displayName: string;
  category:
    | "microsoft"
    | "databases"
    | "cloud_storage"
    | "saas"
    | "files"
    | "web"
    | "analytics"
    | "erp"
    | "crm"
    | "other";
  authMethods: string[];
  creationMethods: ConnectorSeedCreationMethod[];
  gatewayRequired?: boolean;
  iconKey?: string;
  enabled?: boolean;
}

export const connectorSeed: ConnectorSeed[] = [
  // --- Databases (Fabric's "SQL" type covers both Azure SQL Database and
  // on-premises SQL Server — they are NOT separate Fabric connection
  // types; the on-prem case is distinguished by routing the connection
  // through a gateway, not by a different `type`/`creationMethod`) ---
  {
    connectionTypeKey: "SQL",
    displayName: "SQL Database (Azure SQL / SQL Server)",
    category: "databases",
    authMethods: ["UsernamePassword", "OAuth2", "ServicePrincipal", "WorkspaceIdentity"],
    iconKey: "azure-sql",
    creationMethods: [
      {
        name: "Sql",
        parameters: [
          { name: "server", dataType: "Text", required: true, description: "Fully qualified server name" },
          { name: "database", dataType: "Text", required: false },
        ],
      },
    ],
  },
  {
    connectionTypeKey: "PostgreSQL",
    displayName: "PostgreSQL",
    category: "databases",
    authMethods: ["UsernamePassword", "OAuth2"],
    iconKey: "postgresql",
    creationMethods: [
      {
        name: "PostgreSql",
        parameters: [
          { name: "server", dataType: "Text", required: true },
          { name: "database", dataType: "Text", required: true },
        ],
      },
    ],
  },
  {
    connectionTypeKey: "MySql",
    displayName: "MySQL",
    category: "databases",
    authMethods: ["UsernamePassword"],
    iconKey: "mysql",
    creationMethods: [
      {
        name: "MySql",
        parameters: [
          { name: "server", dataType: "Text", required: true },
          { name: "database", dataType: "Text", required: true },
        ],
      },
    ],
  },
  {
    connectionTypeKey: "Oracle",
    displayName: "Oracle Database",
    category: "databases",
    authMethods: ["UsernamePassword", "OAuth2"],
    gatewayRequired: true,
    iconKey: "oracle",
    creationMethods: [
      {
        name: "Oracle",
        parameters: [{ name: "server", dataType: "Text", required: true }],
      },
    ],
  },
  {
    connectionTypeKey: "Snowflake",
    displayName: "Snowflake",
    category: "databases",
    authMethods: ["UsernamePassword", "OAuth2", "KeyPair"],
    iconKey: "snowflake",
    creationMethods: [
      {
        name: "Snowflake.Databases",
        parameters: [
          { name: "server", dataType: "Text", required: true },
          { name: "warehouse", dataType: "Text", required: true },
          { name: "Role", dataType: "Text", required: false },
        ],
      },
    ],
  },
  {
    connectionTypeKey: "AzureSqlMI",
    displayName: "Azure SQL Managed Instance",
    category: "databases",
    authMethods: ["UsernamePassword", "OAuth2", "ServicePrincipal"],
    iconKey: "azure-sql",
    creationMethods: [
      {
        name: "AzureSqlMI.Database",
        parameters: [
          { name: "server", dataType: "Text", required: true },
          { name: "database", dataType: "Text", required: true },
        ],
      },
    ],
  },

  // --- Microsoft ---
  {
    connectionTypeKey: "OneLakeFile",
    displayName: "OneLake",
    category: "microsoft",
    authMethods: ["OAuth2", "ServicePrincipal"],
    iconKey: "onelake",
    creationMethods: [
      {
        name: "OneLake.Contents",
        parameters: [{ name: "path", dataType: "Text", required: true }],
      },
    ],
  },
  {
    connectionTypeKey: "SharePoint",
    displayName: "SharePoint Online List",
    category: "microsoft",
    authMethods: ["OAuth2", "ServicePrincipal", "WorkspaceIdentity", "Anonymous"],
    iconKey: "sharepoint",
    creationMethods: [
      {
        name: "SharePointList",
        parameters: [{ name: "sharePointSiteUrl", dataType: "Text", required: true }],
      },
    ],
  },
  {
    connectionTypeKey: "Dynamics365",
    displayName: "Dynamics 365",
    category: "microsoft",
    authMethods: ["OAuth2", "ServicePrincipal", "WorkspaceIdentity"],
    iconKey: "dynamics-365",
    creationMethods: [
      {
        name: "Dynamics365.Contents",
        parameters: [{ name: "server", dataType: "Text", required: true }],
      },
    ],
  },

  // --- Cloud Storage ---
  {
    connectionTypeKey: "AzureDataLakeStorage",
    displayName: "Azure Data Lake Storage Gen2",
    category: "cloud_storage",
    authMethods: ["AccountKey", "OAuth2", "SharedAccessSignature", "ServicePrincipal", "WorkspaceIdentity"],
    iconKey: "adls-gen2",
    creationMethods: [
      {
        name: "AzureDataLakeStorage",
        parameters: [
          { name: "server", dataType: "Text", required: true, description: "Storage account endpoint" },
          { name: "path", dataType: "Text", required: true },
        ],
      },
    ],
  },
  {
    connectionTypeKey: "AzureBlobs",
    displayName: "Azure Blob Storage",
    category: "cloud_storage",
    // "Anonymous" is real, documented Fabric behavior for public read-only
    // containers (e.g. Microsoft's own public sample datasets) — not a
    // fabricated capability; see docs/CONNECTORS.md.
    authMethods: ["AccountKey", "OAuth2", "SharedAccessSignature", "ServicePrincipal", "WorkspaceIdentity", "Anonymous"],
    iconKey: "blob-storage",
    creationMethods: [
      {
        name: "AzureBlobs",
        parameters: [
          { name: "account", dataType: "Text", required: true },
          { name: "domain", dataType: "Text", required: true },
        ],
      },
    ],
  },

  // --- SaaS ---
  {
    connectionTypeKey: "Salesforce",
    displayName: "Salesforce",
    category: "saas",
    authMethods: ["OAuth2"],
    iconKey: "salesforce",
    creationMethods: [
      {
        name: "Salesforce",
        parameters: [
          { name: "loginServer", dataType: "Text", required: true },
          { name: "classInfo", dataType: "Text", required: true },
        ],
      },
    ],
  },

  // --- Files --- (no generic gateway "Folder" type was found in the live
  // supported-types response — see the module doc comment)
  {
    connectionTypeKey: "Folder",
    displayName: "Folder / Files",
    category: "files",
    authMethods: ["Windows", "Anonymous"],
    gatewayRequired: true,
    iconKey: "folder",
    enabled: false,
    creationMethods: [
      {
        name: "Folder",
        parameters: [{ name: "path", dataType: "Text", required: true }],
      },
    ],
  },

  // --- Web ---
  {
    connectionTypeKey: "Web",
    displayName: "Web",
    category: "web",
    authMethods: ["Anonymous", "UsernamePassword", "OAuth2", "ServicePrincipal", "WorkspaceIdentity"],
    iconKey: "web",
    creationMethods: [
      {
        name: "Web",
        parameters: [{ name: "url", dataType: "Text", required: true }],
      },
    ],
  },
  {
    connectionTypeKey: "RestService",
    displayName: "REST API",
    category: "web",
    authMethods: ["Anonymous", "APIKey", "OAuth2", "ServicePrincipal"],
    iconKey: "rest-api",
    creationMethods: [
      {
        name: "RestService.Contents",
        parameters: [
          { name: "baseUrl", dataType: "Text", required: true },
          { name: "audience", dataType: "Text", required: false },
        ],
      },
    ],
  },

  // --- Analytics ---
  {
    connectionTypeKey: "GoogleAnalytics",
    displayName: "Google Analytics",
    category: "analytics",
    authMethods: ["OAuth2"],
    iconKey: "google-analytics",
    creationMethods: [{ name: "GoogleAnalytics", parameters: [] }],
  },

  // --- ERP --- (no "SapHana"/SAP HANA-specific type was found in the live
  // supported-types response — only SAP BW/Table Application/Message
  // Server and SAP Business Data Cloud variants exist; none map cleanly
  // onto a plain HANA connection, so this stays disabled rather than
  // guessed — see the module doc comment)
  {
    connectionTypeKey: "SapHana",
    displayName: "SAP HANA",
    category: "erp",
    authMethods: ["UsernamePassword", "Windows"],
    gatewayRequired: true,
    iconKey: "sap-hana",
    enabled: false,
    creationMethods: [
      {
        name: "SapHana",
        parameters: [
          { name: "server", dataType: "Text", required: true },
          { name: "instanceNumber", dataType: "Text", required: false },
        ],
      },
    ],
  },

  // --- CRM --- (no "Hubspot"/"HubSpot" type was found in the live
  // supported-types response for this tenant — disabled rather than
  // guessed; a real sync may surface it under a different name)
  {
    connectionTypeKey: "Hubspot",
    displayName: "HubSpot",
    category: "crm",
    authMethods: ["OAuth2", "APIKey"],
    iconKey: "hubspot",
    enabled: false,
    creationMethods: [{ name: "Hubspot", parameters: [] }],
  },
];
