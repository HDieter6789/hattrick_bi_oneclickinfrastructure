import { requireAuth } from "@/lib/authz";
import { toErrorResponse } from "@/lib/api-response";
import { createDeployment } from "@/features/provisioning/service";

/** POST /api/deployments — the security-critical "CREATE INFRASTRUCTURE"
 * action. Body: `{ infrastructureConfigurationId: string; appointmentId: string; rollbackPolicy?: "KEEP_SUCCESSFUL_RESOURCES" | "ROLLBACK_CREATED_RESOURCES" }`
 * (see src/features/provisioning/schemas.ts's createDeploymentInput — no
 * `customerId` field: the owning customer is resolved server-side from
 * `infrastructureConfigurationId`, and `createdById` is always the acting
 * user's id from requireAuth(), never the request body, so neither can be
 * spoofed by a client).
 * Response: `{ deployment: Deployment & { desiredResources: DesiredResource[] } }`, status 201.
 * Only queues the deployment as `status: "draft"` — see
 * POST /api/deployments/[id]/start to actually run it. */
export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireAuth();
    const body = await request.json();
    const deployment = await createDeployment({ ...body, createdById: ctx.userId });
    return Response.json({ deployment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
