import { requireCustomerAccess } from "@/lib/require-customer-access";
import { toErrorResponse } from "@/lib/api-response";
import { childLogger } from "@/lib/logger";
import { createIngestionConfiguration, listIngestionConfigurations } from "@/services/ingestion";

const log = childLogger({ module: "api.ingestion" });

/** GET /api/ingestion?customerId=...&infrastructureConfigurationId=... —
 * list a customer's ingestion configurations. */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId");
    const infrastructureConfigurationId = url.searchParams.get("infrastructureConfigurationId");
    if (!customerId || !infrastructureConfigurationId) {
      return Response.json(
        { error: "customerId and infrastructureConfigurationId query parameters are required" },
        { status: 400 },
      );
    }
    await requireCustomerAccess(customerId);

    const ingestions = await listIngestionConfigurations(customerId, infrastructureConfigurationId);
    return Response.json({ ingestions });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/ingestion — create an ingestion configuration. Plan-time only:
 * does not call Fabric (see services/ingestion/ingestion-service.ts). */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const ingestion = await createIngestionConfiguration(body);
    log.info({ ingestionConfigurationId: ingestion.id }, "Ingestion configuration created via API");
    return Response.json({ ingestion }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
