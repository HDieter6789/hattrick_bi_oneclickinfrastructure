import { requireAuth } from "@/lib/authz";
import { toErrorResponse } from "@/lib/api-response";
import { recordAdminAuditLog } from "@/features/admin-portal/audit";
import {
  getAdminFabricCapability,
  updateAdminFabricCapability,
  type UpdateAdminFabricCapabilityDraft,
} from "@/features/admin-portal/fabric-capabilities";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/admin/fabric-capabilities/[id] — one capability with its
 * ordered parameter schemas. */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const capability = await getAdminFabricCapability(id);
    if (!capability) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ capability });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PATCH /api/admin/fabric-capabilities/[id] — full-field edit (beyond the
 * registry service's narrower `updateCapability`). */
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const actor = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as UpdateAdminFabricCapabilityDraft;
    const capability = await updateAdminFabricCapability(id, body);
    await recordAdminAuditLog({
      actor,
      action: "fabric_capability.update",
      resourceType: "FabricCapability",
      resourceId: id,
      metadata: { itemType: capability.itemType, patch: body },
    });
    return Response.json({ capability });
  } catch (error) {
    return toErrorResponse(error);
  }
}
