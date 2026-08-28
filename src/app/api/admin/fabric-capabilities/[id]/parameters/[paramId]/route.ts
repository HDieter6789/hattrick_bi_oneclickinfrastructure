import { requireAuth } from "@/lib/authz";
import { toErrorResponse } from "@/lib/api-response";
import { recordAdminAuditLog } from "@/features/admin-portal/audit";
import {
  deleteAdminParameterSchema,
  updateAdminParameterSchema,
  type UpdateAdminParameterSchemaDraft,
} from "@/features/admin-portal/fabric-capabilities";

interface RouteParams {
  params: Promise<{ id: string; paramId: string }>;
}

/** PATCH /api/admin/fabric-capabilities/[id]/parameters/[paramId] — edit
 * one parameter-schema row. */
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const actor = await requireAuth();
    const { id, paramId } = await params;
    const body = (await request.json()) as UpdateAdminParameterSchemaDraft;
    const parameter = await updateAdminParameterSchema(id, paramId, body);
    await recordAdminAuditLog({
      actor,
      action: "fabric_capability.parameter.update",
      resourceType: "FabricParameterSchema",
      resourceId: paramId,
      metadata: { fabricCapabilityId: id, patch: body },
    });
    return Response.json({ parameter });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/admin/fabric-capabilities/[id]/parameters/[paramId] —
 * remove one parameter-schema row. */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const actor = await requireAuth();
    const { id, paramId } = await params;
    await deleteAdminParameterSchema(id, paramId);
    await recordAdminAuditLog({
      actor,
      action: "fabric_capability.parameter.delete",
      resourceType: "FabricParameterSchema",
      resourceId: paramId,
      metadata: { fabricCapabilityId: id },
    });
    return Response.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
