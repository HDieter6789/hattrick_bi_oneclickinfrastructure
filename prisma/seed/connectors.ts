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
 * Covers every category in the brief (Microsoft, Databases, Cloud Storage,
 * SaaS, Files, Web, Analytics, ERP, CRM) plus every connector explicitly
 * named in the brief.
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
}

export const connectorSeed: ConnectorSeed[] = [
  // --- Microsoft ---
  {
    connectionTypeKey: "AzureSQL",
    displayName: "Azure SQL Database",
    category: "microsoft",
    authMethods: ["ServicePrincipal", "UsernamePassword", "OrganizationalAccount"],
    iconKey: "azure-sql",
    creationMethods: [
      {
        name: "AzureSqlDatabase",
        parameters: [
          { name: "server", dataType: "Text", required: true, description: "Fully qualified server name" },
          { name: "database", dataType: "Text", required: true },
        ],
      },
    ],
  },
  {
    connectionTypeKey: "OneLake",
    displayName: "OneLake",
    category: "microsoft",
    authMethods: ["OrganizationalAccount", "ServicePrincipal", "WorkspaceIdentity"],
    iconKey: "onelake",
    creationMethods: [
      {
        name: "OneLake",
        parameters: [
          { name: "workspaceId", dataType: "Text", required: true },
          { name: "itemId", dataType: "Text", required: true },
        ],
      },
    ],
  },
  {
    connectionTypeKey: "SharePointOnlineList",
    displayName: "SharePoint Online List",
    category: "microsoft",
    authMethods: ["OrganizationalAccount", "ServicePrincipal"],
    iconKey: "sharepoint",
    creationMethods: [
      {
        name: "SharePointOnlineList",
        parameters: [{ name: "siteUrl", dataType: "Text", required: true }],
      },
    ],
  },
  {
    connectionTypeKey: "Dynamics365",
    displayName: "Dynamics 365",
    category: "microsoft",
    authMethods: ["OrganizationalAccount", "ServicePrincipal", "OAuth2"],
    iconKey: "dynamics-365",
    creationMethods: [
      {
        name: "Dynamics365",
        parameters: [{ name: "organizationUrl", dataType: "Text", required: true }],
      },
    ],
  },

  // --- Databases ---
  {
    connectionTypeKey: "SQLServer",
    displayName: "SQL Server",
    category: "databases",
    authMethods: ["UsernamePassword", "Windows", "WindowsWithoutImpersonation"],
    gatewayRequired: true,
    iconKey: "sql-server",
    creationMethods: [
      {
        name: "SqlServer",
        parameters: [
          { name: "server", dataType: "Text", required: true },
          { name: "database", dataType: "Text", required: false },
        ],
      },
    ],
  },
  {
    connectionTypeKey: "PostgreSql",
    displayName: "PostgreSQL",
    category: "databases",
    authMethods: ["UsernamePassword"],
    iconKey: "postgresql",
    creationMethods: [
      {
        name: "PostgreSql",
        parameters: [
          { name: "server", dataType: "Text", required: true },
          { name: "database", dataType: "Text", required: true },
          { name: "port", dataType: "Number", required: false },
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
    authMethods: ["UsernamePassword"],
    gatewayRequired: true,
    iconKey: "oracle",
    creationMethods: [
      {
        name: "Oracle",
        parameters: [
          { name: "server", dataType: "Text", required: true },
          { name: "serviceName", dataType: "Text", required: true },
        ],
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
        name: "Snowflake",
        parameters: [
          { name: "server", dataType: "Text", required: true },
          { name: "warehouse", dataType: "Text", required: true },
          { name: "database", dataType: "Text", required: false },
        ],
      },
    ],
  },

  // --- Cloud Storage ---
  {
    connectionTypeKey: "AzureDataLakeStorage",
    displayName: "Azure Data Lake Storage Gen2",
    category: "cloud_storage",
    authMethods: ["AccountKey", "ServicePrincipal", "OrganizationalAccount", "SharedAccessSignature"],
    iconKey: "adls-gen2",
    creationMethods: [
      {
        name: "AzureDataLakeStorage",
        parameters: [
          { name: "server", dataType: "Text", required: true, description: "Storage account endpoint" },
          { name: "path", dataType: "Text", required: false },
        ],
      },
    ],
  },
  {
    connectionTypeKey: "AzureBlobStorage",
    displayName: "Azure Blob Storage",
    category: "cloud_storage",
    authMethods: ["AccountKey", "SAS", "ServicePrincipal"],
    iconKey: "blob-storage",
    creationMethods: [
      {
        name: "AzureBlobs",
        parameters: [
          { name: "account", dataType: "Text", required: true },
          { name: "domain", dataType: "Text", required: false },
        ],
      },
    ],
  },

  // --- SaaS ---
  {
    connectionTypeKey: "Salesforce",
    displayName: "Salesforce",
    category: "saas",
    authMethods: ["OAuth2", "UsernamePassword"],
    iconKey: "salesforce",
    creationMethods: [
      {
        name: "Salesforce",
        parameters: [{ name: "environmentUrl", dataType: "Text", required: false }],
      },
    ],
  },

  // --- Files ---
  {
    connectionTypeKey: "Folder",
    displayName: "Folder / Files",
    category: "files",
    authMethods: ["Windows", "Anonymous"],
    gatewayRequired: true,
    iconKey: "folder",
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
    authMethods: ["Anonymous", "Key", "UsernamePassword"],
    iconKey: "web",
    creationMethods: [
      {
        name: "Web",
        parameters: [{ name: "url", dataType: "Text", required: true }],
      },
    ],
  },
  {
    connectionTypeKey: "RestApi",
    displayName: "REST API",
    category: "web",
    authMethods: ["Anonymous", "APIKey", "OAuth2", "ServicePrincipal"],
    iconKey: "rest-api",
    creationMethods: [
      {
        name: "RestApi",
        parameters: [{ name: "baseUrl", dataType: "Text", required: true }],
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
    creationMethods: [
      {
        name: "GoogleAnalytics",
        parameters: [{ name: "propertyId", dataType: "Text", required: true }],
      },
    ],
  },

  // --- ERP ---
  {
    connectionTypeKey: "SapHana",
    displayName: "SAP HANA",
    category: "erp",
    authMethods: ["UsernamePassword", "Windows"],
    gatewayRequired: true,
    iconKey: "sap-hana",
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

  // --- CRM ---
  {
    connectionTypeKey: "Hubspot",
    displayName: "HubSpot",
    category: "crm",
    authMethods: ["OAuth2", "APIKey"],
    iconKey: "hubspot",
    creationMethods: [
      {
        name: "Hubspot",
        parameters: [],
      },
    ],
  },
];
