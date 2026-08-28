import { toErrorResponse } from "@/lib/api-response";
import { startDeployment, getDeployment } from "@/features/provisioning/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** POST /api/deployments/[id]/start — runs preflight
 * (assertDeploymentReadyToStart, re-checking the appointment gate) and then
 * fires the provisioning engine WITHOUT waiting for it to finish (it can
 * take minutes) — poll GET /api/deployments/[id] for live progress. No
 * request body.
 * Response: `{ deployment: Deployment & { desiredResources: ...; steps: ... } }`
 * reflecting the deployment's state at the moment the run was kicked off
 * (typically still `draft`/`pending`, since the run itself is async). */
export async function POST(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    await startDeployment(id);
    const deployment = await getDeployment(id);
    return Response.json({ deployment });
  } catch (error) {
    return toErrorResponse(error);
  }
}
