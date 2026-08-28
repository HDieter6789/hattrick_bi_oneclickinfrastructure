import { requireAuth } from "@/lib/authz";
import { toErrorResponse } from "@/lib/api-response";
import { listConnectorsQuery } from "@/schemas/connection";
import { connectorRegistry } from "@/services/connections";

/** GET /api/connections/connectors?category=databases — browsable connector
 * catalog for the Connections Hub. Any authenticated user may browse it
 * (it contains no customer data); customer-scoped access is enforced when
 * an actual Connection is created. */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const url = new URL(request.url);
    const query = listConnectorsQuery.parse({ category: url.searchParams.get("category") ?? undefined });
    const connectors = await connectorRegistry.getConnectors(query.category);
    return Response.json({ connectors });
  } catch (error) {
    return toErrorResponse(error);
  }
}
