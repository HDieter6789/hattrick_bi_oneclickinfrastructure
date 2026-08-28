/**
 * Pure, framework-free builder for the customer-facing SQL self-service
 * summary. Consumed by the welcome-email template and the customer portal
 * SQL page (both owned elsewhere) — this module only produces the data,
 * never renders it. Deliberately exposes nothing beyond what a customer
 * should see: no workspace/lakehouse ids, no raw Fabric metadata, and never
 * a password (there isn't one — Entra ID only).
 */
export interface SqlAccessSummaryInput {
  server: string;
  database: string;
}

export interface SqlAccessSummary {
  server: string;
  database: string;
  authMethod: "Microsoft Entra ID";
  readOnlyNotice: string;
  exampleQuery: string;
}

const EXAMPLE_QUERY = "SELECT TOP 100 *\nFROM dbo.<example_table>;";

const READ_ONLY_NOTICE =
  "This SQL endpoint is read-only. You can query your Gold-layer data with any SQL client that supports Microsoft Entra ID authentication (e.g. Azure Data Studio, SQL Server Management Studio, or Power BI). No password is needed — sign in with your organizational account.";

/**
 * Builds the customer-facing SQL access summary from a resolved
 * `SqlEndpoint` row (see services/provisioning/steps/resolve-sql-endpoint.ts).
 * Takes only `server`/`database` — not the full Prisma model — so callers
 * can't accidentally pass through `connectionString`, `fabricWorkspaceId`,
 * etc.
 */
export function buildSqlAccessSummary(sqlEndpoint: SqlAccessSummaryInput): SqlAccessSummary {
  return {
    server: sqlEndpoint.server,
    database: sqlEndpoint.database,
    authMethod: "Microsoft Entra ID",
    readOnlyNotice: READ_ONLY_NOTICE,
    exampleQuery: EXAMPLE_QUERY,
  };
}
