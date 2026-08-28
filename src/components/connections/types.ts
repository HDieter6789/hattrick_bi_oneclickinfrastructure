/**
 * Client-safe types for the Connections Hub UI — deliberately not imported
 * from `@/generated/prisma/client` so these components never pull a
 * server-only dependency into the client bundle. Shapes mirror
 * `ConnectorMetadata`/`Connection` (see prisma/schema/connection.prisma)
 * and the JSON API responses from src/app/api/connections/**.
 */

export type ConnectorCategory =
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

export type ConnectionAuthMethod =
  | "OAuth2"
  | "UsernamePassword"
  | "ServicePrincipal"
  | "APIKey"
  | "AccountKey"
  | "SAS"
  | "Anonymous"
  | "OrganizationalAccount"
  | "Gateway"
  | "Key"
  | "Windows"
  | "WindowsWithoutImpersonation"
  | "SharedAccessSignature"
  | "WorkspaceIdentity"
  | "KeyPair";

export interface CreationMethodParameter {
  name: string;
  dataType?: "Text" | "Number" | "Boolean" | string;
  required?: boolean;
  description?: string;
}

export interface CreationMethod {
  name: string;
  parameters?: CreationMethodParameter[];
}

export interface ConnectorCatalogItem {
  connectionTypeKey: string;
  displayName: string;
  category: ConnectorCategory;
  creationMethodsJson: CreationMethod[];
  supportedCredentialTypesJson: ConnectionAuthMethod[];
  gatewayRequired: boolean;
  iconKey: string | null;
  enabled: boolean;
}

/** Auth methods that never require a secret value up front — see
 * schemas/connection.ts (kept in sync manually; both are small, stable
 * enumerations). */
export const AUTH_METHODS_WITHOUT_SECRET: ReadonlySet<ConnectionAuthMethod> = new Set([
  "Anonymous",
  "WorkspaceIdentity",
  "Gateway",
  "OAuth2",
  "OrganizationalAccount",
]);

export const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  microsoft: "Microsoft",
  databases: "Databases",
  cloud_storage: "Cloud Storage",
  saas: "SaaS",
  files: "Files",
  web: "Web",
  analytics: "Analytics",
  erp: "ERP",
  crm: "CRM",
  other: "Other",
};

export const AUTH_METHOD_LABELS: Record<ConnectionAuthMethod, string> = {
  OAuth2: "OAuth2",
  UsernamePassword: "Username & Password",
  ServicePrincipal: "Service Principal",
  APIKey: "API Key",
  AccountKey: "Account Key",
  SAS: "Shared Access Signature (SAS)",
  Anonymous: "Anonymous",
  OrganizationalAccount: "Organizational Account (SSO)",
  Gateway: "On-premises Gateway",
  Key: "Key",
  Windows: "Windows",
  WindowsWithoutImpersonation: "Windows (no impersonation)",
  SharedAccessSignature: "Shared Access Signature",
  WorkspaceIdentity: "Workspace Identity",
  KeyPair: "Key Pair",
};
