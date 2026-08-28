import { requireAuth } from "@/lib/authz";
import { toErrorResponse } from "@/lib/api-response";
import { recordAdminAuditLog } from "@/features/admin-portal/audit";
import { SystemBlueprintNotDeletableError, BlueprintInUseError } from "@/features/admin-portal/pure/blueprint-guard";
import {
  deleteAdminBlueprint,
  getAdminBlueprint,
  updateAdminBlueprint,
  type UpdateBlueprintDraft,
} from "@/features/admin-portal/blueprints";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/admin/blueprints/[id] — one blueprint with its resource list. */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const blueprint = await getAdminBlueprint(id);
    if (!blueprint) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ blueprint });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PATCH /api/admin/blueprints/[id] — edit name/description/pattern and
 * optionally fully replace the resource set. */
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const actor = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as UpdateBlueprintDraft;
    const blueprint = await updateAdminBlueprint(id, body);
    await recordAdminAuditLog({
      actor,
      action: "blueprint.update",
      resourceType: "Blueprint",
      resourceId: id,
      metadata: { resourcesReplaced: body.resources !== undefined },
    });
    return Response.json({ blueprint });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/admin/blueprints/[id] — blocked (403) for `isSystem` rows,
 * and blocked (409) while any InfrastructureConfiguration still references
 * it (see features/admin-portal/pure/blueprint-guard.ts). */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const actor = await requireAuth();
    const { id } = await params;
    await deleteAdminBlueprint(id);
    await recordAdminAuditLog({ actor, action: "blueprint.delete", resourceType: "Blueprint", resourceId: id });
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof SystemBlueprintNotDeletableError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof BlueprintInUseError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return toErrorResponse(error);
  }
}
