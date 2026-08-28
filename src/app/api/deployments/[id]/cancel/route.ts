import { toErrorResponse } from "@/lib/api-response";
import { cancelDeployment, getDeployment } from "@/features/provisioning/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** POST /api/deployments/[id]/cancel — marks a running/pending deployment
 * `cancelled`. Does not roll back already-created resources on its own
 * (see POST /api/deployments/[id]/rollback for that). No request body.
 * Response: `{ deployment: Deployment & { desiredResources: ...; steps: ... } }`. */
export async function POST(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    await cancelDeployment(id);
    const deployment = await getDeployment(id);
    return Response.json({ deployment });
  } catch (error) {
    return toErrorResponse(error);
  }
}
