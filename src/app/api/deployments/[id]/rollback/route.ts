import { toErrorResponse } from "@/lib/api-response";
import { rollbackDeployment } from "@/features/provisioning/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** POST /api/deployments/[id]/rollback — executes ROLLBACK_CREATED_RESOURCES
 * for a failed/cancelled deployment, but only when every created resource is
 * rollback-safe (rejects with a 500 naming what's unsafe otherwise — see
 * src/features/provisioning/service.ts's rollbackDeployment()). A no-op
 * (returns empty arrays) when the deployment's rollbackPolicy is
 * KEEP_SUCCESSFUL_RESOURCES. No request body.
 * Response: `{ result: { deleted: string[]; requiresManualReview: string[] } }`. */
export async function POST(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const result = await rollbackDeployment(id);
    return Response.json({ result });
  } catch (error) {
    return toErrorResponse(error);
  }
}
