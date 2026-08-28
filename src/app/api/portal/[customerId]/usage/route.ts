import { toErrorResponse } from "@/lib/api-response";
import { getCustomerUsageSnapshot } from "@/services/monitoring";

interface RouteParams {
  params: Promise<{ customerId: string }>;
}

/** GET /api/portal/[customerId]/usage — the leak-safe Customer Usage
 * Report pipeline (services/monitoring/collector.ts's
 * getCustomerUsageSnapshot, which itself enforces requireCustomerAccess and
 * derives everything from this platform's own DB — never from a shared
 * Fabric capacity/administration endpoint).
 * Response: `{ usage: CustomerUsageSnapshot }`. */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { customerId } = await params;
    const usage = await getCustomerUsageSnapshot(customerId);
    return Response.json({ usage });
  } catch (error) {
    return toErrorResponse(error);
  }
}
