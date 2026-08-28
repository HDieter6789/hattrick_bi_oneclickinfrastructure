import "server-only";
import { prisma } from "@/db/prisma";
import { childLogger } from "@/lib/logger";
import { requireCustomerAccess } from "@/lib/require-customer-access";
import { ForbiddenError } from "@/lib/authz";
import { createIngestionConfigurationInput, type CreateIngestionConfigurationDraft } from "@/schemas/ingestion";
import { resolveScheduleCron } from "./schedule";
import type { IngestionConfiguration } from "@/generated/prisma/client";

const log = childLogger({ module: "ingestion.service" });

/**
 * Plan-time ingestion configuration. This is deliberately NOT a
 * provisioning action: it validates and persists an `IngestionConfiguration`
 * row only — no Fabric API call happens here. The actual Fabric CopyJob/
 * Pipeline item is created later as a `DesiredResource` when a deployment
 * plan is generated (a separate module owns wiring ingestion configs into
 * the planner — see prisma/schema/ingestion.prisma's
 * `fabricPipelineItemId` field and services/provisioning/steps/run-initial-load.ts
 * for what that step expects once the wiring exists).
 */
export async function createIngestionConfiguration(
  draft: CreateIngestionConfigurationDraft,
): Promise<IngestionConfiguration> {
  const input = createIngestionConfigurationInput.parse(draft);
  await requireCustomerAccess(input.customerId);

  // Defense in depth: never trust that the connection/configuration ids a
  // caller supplied actually belong to the customer they claimed — a
  // customer_user could otherwise probe or attach another customer's
  // connection by guessing its id.
  const [configuration, connection] = await Promise.all([
    prisma.infrastructureConfiguration.findUnique({ where: { id: input.infrastructureConfigurationId } }),
    prisma.connection.findUnique({ where: { id: input.connectionId } }),
  ]);

  if (!configuration || configuration.customerId !== input.customerId) {
    throw new ForbiddenError("Infrastructure configuration does not belong to this customer");
  }
  if (!connection || connection.customerId !== input.customerId) {
    throw new ForbiddenError("Connection does not belong to this customer");
  }

  const scheduleCron = resolveScheduleCron(input.scheduleFrequency);

  const created = await prisma.ingestionConfiguration.create({
    data: {
      connectionId: input.connectionId,
      infrastructureConfigurationId: input.infrastructureConfigurationId,
      sourceObject: input.sourceObject,
      loadMethod: input.loadMethod,
      watermarkColumn: input.watermarkColumn ?? null,
      destinationLogicalName: input.destinationLogicalName,
      destinationTable: input.destinationTable ?? null,
      scheduleFrequency: input.scheduleFrequency,
      scheduleCron,
    },
  });

  log.info(
    { ingestionConfigurationId: created.id, infrastructureConfigurationId: input.infrastructureConfigurationId },
    "Ingestion configuration created",
  );
  return created;
}

/** Lists ingestion configurations for one InfrastructureConfiguration,
 * customer-access-checked. Used by the (future) planner integration and by
 * the customer portal's ingestion review step. */
export async function listIngestionConfigurations(
  customerId: string,
  infrastructureConfigurationId: string,
): Promise<IngestionConfiguration[]> {
  await requireCustomerAccess(customerId);

  const configuration = await prisma.infrastructureConfiguration.findUnique({
    where: { id: infrastructureConfigurationId },
  });
  if (!configuration || configuration.customerId !== customerId) {
    throw new ForbiddenError("Infrastructure configuration does not belong to this customer");
  }

  return prisma.ingestionConfiguration.findMany({
    where: { infrastructureConfigurationId },
    orderBy: { createdAt: "asc" },
  });
}
