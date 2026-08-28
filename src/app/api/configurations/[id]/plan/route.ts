import { toErrorResponse } from "@/lib/api-response";
import { generateConfigurationPlan } from "@/features/provisioning/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** POST /api/configurations/[id]/plan — generates the Terraform-like
 * deployment plan preview (services/provisioning/planner.ts) for the
 * wizard's Review step, merging in any saved draft resource-parameter
 * overrides. No request body.
 * Response: `{ plan: DeploymentPlan }` where
 * `DeploymentPlan = { resources: PlannedResource[]; order: string[]; summary: { total: number; byType: Record<string, number> } }`. */
export async function POST(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const plan = await generateConfigurationPlan(id);
    return Response.json({ plan });
  } catch (error) {
    return toErrorResponse(error);
  }
}
