import { toErrorResponse } from "@/lib/api-response";
import { getCustomerUsageSnapshot } from "@/services/monitoring";

/** GET /api/monitoring/usage?customerId=... — the Customer Usage Report
 * snapshot (services/monitoring/collector.ts). Access-checked and
 * feature-flag-gated inside `getCustomerUsageSnapshot` itself. */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId");
    if (!customerId) {
      return Response.json({ error: "customerId query parameter is required" }, { status: 400 });
    }

    const snapshot = await getCustomerUsageSnapshot(customerId);
    return Response.json({ snapshot });
  } catch (error) {
    return toErrorResponse(error);
  }
}
