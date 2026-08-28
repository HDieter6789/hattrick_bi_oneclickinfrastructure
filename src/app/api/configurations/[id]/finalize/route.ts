import { toErrorResponse } from "@/lib/api-response";
import { finalizeConfiguration } from "@/features/provisioning/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** POST /api/configurations/[id]/finalize — locks in the current draft:
 * status -> "finalized", writes a real ConfigurationVersion snapshot at
 * `currentVersion`, and increments `currentVersion`. No request body.
 * Response: `{ configuration: InfrastructureConfiguration }`. */
export async function POST(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const configuration = await finalizeConfiguration(id);
    return Response.json({ configuration });
  } catch (error) {
    return toErrorResponse(error);
  }
}
