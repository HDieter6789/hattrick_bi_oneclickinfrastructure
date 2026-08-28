import { prisma } from "@/db/prisma";
import { requireCustomerAccess } from "@/lib/require-customer-access";
import { toErrorResponse } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ customerId: string }>;
}

/** GET /api/portal/[customerId]/datasets — the customer-facing "Available
 * Data" catalog (deliberately excludes pipeline/notebook/lineage internals
 * — DatasetCatalogEntry itself is the curated, customer-safe shape).
 * Response: `{ datasets: DatasetCatalogEntry[] }`. */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { customerId } = await params;
    await requireCustomerAccess(customerId);

    const datasets = await prisma.datasetCatalogEntry.findMany({
      where: { customerId },
      orderBy: { name: "asc" },
    });
    return Response.json({ datasets });
  } catch (error) {
    return toErrorResponse(error);
  }
}
