import { requireAuth } from "@/lib/authz";
import { toErrorResponse } from "@/lib/api-response";
import { recordAdminAuditLog } from "@/features/admin-portal/audit";
import { cloneAdminBlueprint } from "@/features/admin-portal/blueprints";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** POST /api/admin/blueprints/[id]/clone — creates a new, non-system
 * blueprint with `clonedFromId` set, copying all BlueprintResource rows. */
export async function POST(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const actor = await requireAuth();
    const { id } = await params;
    const clone = await cloneAdminBlueprint(id);
    await recordAdminAuditLog({
      actor,
      action: "blueprint.clone",
      resourceType: "Blueprint",
      resourceId: clone.id,
      metadata: { clonedFromId: id },
    });
    return Response.json({ blueprint: clone }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
