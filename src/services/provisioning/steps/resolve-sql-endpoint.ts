import { prisma } from "@/db/prisma";
import { getFabricApiClient, FabricApiException } from "@/services/fabric";
import { redactForPersistence } from "@/lib/redact";
import { childLogger } from "@/lib/logger";
import { NonRetryableStepError, type StepExecutionContext, type StepExecutor, type StepResult } from "../step-executor";

const log = childLogger({ module: "provisioning.step.resolve-sql-endpoint" });

/** Bounded poll budget for one step invocation. If the Lakehouse's SQL
 * Analytics Endpoint is still `InProgress` after this many attempts, the
 * step returns `failed` rather than blocking indefinitely — the engine's
 * own step-level retry (re-running the deployment re-invokes any
 * non-succeeded fixed step, up to MAX_STEP_ATTEMPTS) picks up polling again
 * on the next run, so this never needs to poll forever in one call. */
const MAX_POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 2000;

interface SqlEndpointProperties {
  connectionString?: string;
  id?: string;
  provisioningStatus?: "InProgress" | "Success" | "Failed";
}

interface LakehouseResponse {
  id: string;
  properties?: {
    sqlEndpointProperties?: SqlEndpointProperties;
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fixed step that resolves the customer-facing SQL Analytics Endpoint for
 * the deployment's Gold Lakehouse, once `InfrastructureConfiguration.sqlSelfServiceEnabled`
 * is on. Registered to run AFTER `run_initial_load` (see register-steps.ts)
 * so SQL access reflects loaded data rather than an empty Lakehouse.
 *
 * Per Fabric's documented behavior, a Lakehouse's SQL endpoint provisions
 * asynchronously after the Lakehouse item itself already exists
 * (`GET /v1/workspaces/{workspaceId}/lakehouses/{lakehouseId}` →
 * `properties.sqlEndpointProperties.provisioningStatus`), so this step
 * polls rather than assuming it is ready immediately.
 *
 * Idempotent: skips if a `SqlEndpoint` for this Lakehouse already resolved
 * successfully.
 */
export const resolveSqlEndpointStep: StepExecutor = {
  stepKey: "resolve_sql_endpoint",
  name: "Resolve SQL analytics endpoint",

  async execute({ deployment, correlationId }: StepExecutionContext): Promise<StepResult> {
    const configuration = await prisma.infrastructureConfiguration.findUniqueOrThrow({
      where: { id: deployment.infrastructureConfigurationId },
    });

    if (!configuration.sqlSelfServiceEnabled) {
      return { outcome: "skipped" };
    }

    const goldLakehouse = await prisma.desiredResource.findFirst({
      where: { deploymentId: deployment.id, layer: "gold", type: "Lakehouse" },
      include: { actualResource: true },
    });

    if (!goldLakehouse?.actualResource) {
      throw new NonRetryableStepError(
        "SQL self-service is enabled but no Gold Lakehouse resource exists for this deployment",
        "MISSING_GOLD_LAKEHOUSE",
      );
    }

    const { fabricWorkspaceId: workspaceId, fabricItemId: lakehouseId } = goldLakehouse.actualResource;

    const existing = await prisma.sqlEndpoint.findUnique({ where: { fabricLakehouseId: lakehouseId } });
    if (existing?.provisioningStatus === "Success") {
      log.info({ fabricLakehouseId: lakehouseId }, "SQL endpoint already resolved — skipping");
      return { outcome: "skipped", resourceId: existing.id };
    }

    const client = getFabricApiClient();
    let sqlEndpointProperties: SqlEndpointProperties | undefined = undefined;

    try {
      for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
        const lakehouse = await client.get<LakehouseResponse>(`/workspaces/${workspaceId}/lakehouses/${lakehouseId}`, {
          correlationId,
        });
        sqlEndpointProperties = lakehouse.properties?.sqlEndpointProperties;

        if (sqlEndpointProperties?.provisioningStatus && sqlEndpointProperties.provisioningStatus !== "InProgress") {
          break;
        }

        if (attempt < MAX_POLL_ATTEMPTS) {
          await delay(POLL_INTERVAL_MS);
        }
      }
    } catch (error) {
      if (error instanceof FabricApiException) {
        return {
          outcome: "failed",
          errorCode: error.errorCode ?? String(error.status),
          errorMessage: error.message,
          responseMetadata: redactForPersistence(error.details),
        };
      }
      throw error;
    }

    if (!sqlEndpointProperties || sqlEndpointProperties.provisioningStatus === "InProgress") {
      return {
        outcome: "failed",
        errorCode: "SQL_ENDPOINT_POLL_TIMEOUT",
        errorMessage: `SQL endpoint still provisioning after ${MAX_POLL_ATTEMPTS} polls — will retry on next deployment run`,
      };
    }

    if (sqlEndpointProperties.provisioningStatus !== "Success" || !sqlEndpointProperties.connectionString) {
      return {
        outcome: "failed",
        errorCode: "SQL_ENDPOINT_PROVISIONING_FAILED",
        errorMessage: "Fabric reported the SQL analytics endpoint failed to provision",
        responseMetadata: redactForPersistence(sqlEndpointProperties),
      };
    }

    // A Lakehouse's SQL endpoint has no separate "database" field in
    // sqlEndpointProperties — each Lakehouse is exposed as its own logical
    // database on the shared workspace SQL server, named after the
    // Lakehouse itself. No credential is ever included: auth is Entra ID
    // only (see SqlEndpoint model doc comment).
    const server = sqlEndpointProperties.connectionString;
    const database = goldLakehouse.displayName;
    const connectionString = `Server=${server};Database=${database};Authentication=Active Directory Interactive`;

    const sqlEndpoint = await prisma.sqlEndpoint.upsert({
      where: { fabricLakehouseId: lakehouseId },
      create: {
        customerId: deployment.customerId,
        fabricWorkspaceId: workspaceId,
        fabricLakehouseId: lakehouseId,
        server,
        database,
        connectionString,
        provisioningStatus: "Success",
        readOnly: true,
        exposedInPortal: true,
      },
      update: {
        server,
        database,
        connectionString,
        provisioningStatus: "Success",
        readOnly: true,
        exposedInPortal: true,
      },
    });

    log.info({ sqlEndpointId: sqlEndpoint.id, fabricLakehouseId: lakehouseId }, "SQL endpoint resolved");

    return {
      outcome: "succeeded",
      resourceId: sqlEndpoint.id,
      requestMetadata: redactForPersistence({ workspaceId, lakehouseId }),
      responseMetadata: redactForPersistence(sqlEndpointProperties),
    };
  },
};
