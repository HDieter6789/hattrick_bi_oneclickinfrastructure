import { requireCustomerAccess } from "@/lib/require-customer-access";
import { toErrorResponse } from "@/lib/api-response";
import { prisma } from "@/db/prisma";
import { syncDatasetCatalog } from "@/services/monitoring";

/** GET /api/monitoring/catalog?customerId=... — the customer's current
 * "Available Data" catalog (DatasetCatalogEntry rows). */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId");
    if (!customerId) {
      return Response.json({ error: "customerId query parameter is required" }, { status: 400 });
    }
    await requireCustomerAccess(customerId);

    const catalog = await prisma.datasetCatalogEntry.findMany({ where: { customerId }, orderBy: { name: "asc" } });
    return Response.json({ catalog });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/monitoring/catalog — re-derive the catalog from the
 * customer's current Gold-layer resources (services/monitoring/dataset-catalog.ts).
 * Called after a deployment finishes provisioning/updating Gold resources. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const customerId = typeof body?.customerId === "string" ? body.customerId : null;
    if (!customerId) {
      return Response.json({ error: "customerId is required" }, { status: 400 });
    }

    const catalog = await syncDatasetCatalog(customerId);
    return Response.json({ catalog });
  } catch (error) {
    return toErrorResponse(error);
  }
}
