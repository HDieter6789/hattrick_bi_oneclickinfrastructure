import { requireAuth } from "@/lib/authz";
import { toErrorResponse } from "@/lib/api-response";
import { recordAdminAuditLog } from "@/features/admin-portal/audit";
import { addAdminParameterSchema, type AddAdminParameterSchemaDraft } from "@/features/admin-portal/fabric-capabilities";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** POST /api/admin/fabric-capabilities/[id]/parameters — add one
 * parameter-schema row to a capability. */
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const actor = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as AddAdminParameterSchemaDraft;
    const parameter = await addAdminParameterSchema(id, body);
    await recordAdminAuditLog({
      actor,
      action: "fabric_capability.parameter.create",
      resourceType: "FabricParameterSchema",
      resourceId: parameter.id,
      metadata: { fabricCapabilityId: id, key: parameter.key },
    });
    return Response.json({ parameter }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
