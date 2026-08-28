import { toErrorResponse } from "@/lib/api-response";
import { getDeployment } from "@/features/provisioning/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/deployments/[id] — one Deployment with its desiredResources
 * (each including its actualResource, once provisioned) and steps (ordered
 * by sequence). Internal roles, or the owning customer's own members
 * (enforced inside getDeployment()).
 * Response: `{ deployment: Deployment & { desiredResources: (DesiredResource & { actualResource: ActualResource | null })[]; steps: DeploymentStep[] } }`. */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const deployment = await getDeployment(id);
    return Response.json({ deployment });
  } catch (error) {
    return toErrorResponse(error);
  }
}
