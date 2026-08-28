import "server-only";
import { prisma } from "@/db/prisma";
import { childLogger } from "@/lib/logger";
import { requireCustomerAccess } from "@/lib/require-customer-access";
import type { DatasetCatalogEntry } from "@/generated/prisma/client";

const log = childLogger({ module: "monitoring.dataset-catalog" });

/** Gold-layer item types that are meaningful to a customer as "a dataset" —
 * deliberately excludes pipelines/notebooks/transforms/lineage internals
 * (brief section 22: the customer-facing catalog is business data only). */
const CATALOG_ELIGIBLE_TYPES = ["Lakehouse", "Warehouse"] as const;

/**
 * Derives `DatasetCatalogEntry` rows from the customer's Gold-layer
 * `DesiredResource`s. Idempotent/upsert-based: re-running for a customer
 * updates existing catalog rows rather than duplicating them, keyed by
 * `(customerId, desiredResourceLogicalName)` — see the additive
 * `@@unique` on `DatasetCatalogEntry` in prisma/schema/data.prisma, added
 * specifically so this sync has a stable natural key to upsert against.
 *
 * `availableViaSql` reflects whether a `SqlEndpoint` exists for that exact
 * Fabric item; `availableViaReport` reflects whether the customer has any
 * active Report item at all (Fabric reports aren't scoped to one dataset
 * the way a SQL endpoint is scoped to one Lakehouse, so this is
 * necessarily coarser — "yes, there's a report available in this
 * customer's workspace" rather than "yes, this exact dataset has a
 * report").
 */
export async function syncDatasetCatalog(customerId: string): Promise<DatasetCatalogEntry[]> {
  await requireCustomerAccess(customerId);

  const [goldResources, sqlEndpoints, reportResources] = await Promise.all([
    prisma.desiredResource.findMany({
      where: {
        layer: "gold",
        type: { in: [...CATALOG_ELIGIBLE_TYPES] },
        deployment: { customerId },
        actualResource: { isNot: null },
      },
      include: { actualResource: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.sqlEndpoint.findMany({ where: { customerId } }),
    prisma.desiredResource.findMany({
      where: { type: "Report", deployment: { customerId }, actualResource: { isNot: null } },
      include: { actualResource: true },
    }),
  ]);

  const sqlLakehouseIds = new Set(sqlEndpoints.map((e) => e.fabricLakehouseId));
  const hasActiveReport = reportResources.some((r) => r.actualResource?.provisioningStatus === "active");

  const entries: DatasetCatalogEntry[] = [];
  for (const resource of goldResources) {
    const actual = resource.actualResource!;
    const entry = await prisma.datasetCatalogEntry.upsert({
      where: { customerId_desiredResourceLogicalName: { customerId, desiredResourceLogicalName: resource.logicalName } },
      create: {
        customerId,
        name: resource.displayName,
        layer: resource.layer ?? "gold",
        availableViaSql: sqlLakehouseIds.has(actual.fabricItemId),
        availableViaReport: hasActiveReport,
        desiredResourceLogicalName: resource.logicalName,
      },
      update: {
        name: resource.displayName,
        layer: resource.layer ?? "gold",
        availableViaSql: sqlLakehouseIds.has(actual.fabricItemId),
        availableViaReport: hasActiveReport,
      },
    });
    entries.push(entry);
  }

  log.info({ customerId, entryCount: entries.length }, "Dataset catalog synced");
  return entries;
}
