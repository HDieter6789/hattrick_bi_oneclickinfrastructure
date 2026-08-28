import { toErrorResponse } from "@/lib/api-response";
import { listDeploymentsForCustomer } from "@/features/provisioning/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/customers/[id]/deployments — every Deployment for this customer
 * (internal roles, or the customer's own members via requireCustomerAccess,
 * enforced inside listDeploymentsForCustomer()).
 * Response: `{ deployments: Deployment[] }`. */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const deployments = await listDeploymentsForCustomer(id);
    return Response.json({ deployments });
  } catch (error) {
    return toErrorResponse(error);
  }
}
