import { requireAuth } from "@/lib/authz";
import { toErrorResponse } from "@/lib/api-response";
import { recordAdminAuditLog } from "@/features/admin-portal/audit";
import { createAdminBlueprint, listAdminBlueprints, type CreateBlueprintDraft, type ListBlueprintsDraft } from "@/features/admin-portal/blueprints";

/** GET /api/admin/blueprints?pattern= — list blueprints with their
 * resources and a referencing-configuration count. */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const query: ListBlueprintsDraft = {
      pattern: (url.searchParams.get("pattern") as ListBlueprintsDraft["pattern"]) ?? undefined,
    };
    const blueprints = await listAdminBlueprints(query);
    return Response.json({ blueprints });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/admin/blueprints — create a new (non-system) blueprint with
 * its resource set. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireAuth();
    const body = (await request.json()) as CreateBlueprintDraft;
    const blueprint = await createAdminBlueprint(body);
    await recordAdminAuditLog({
      actor,
      action: "blueprint.create",
      resourceType: "Blueprint",
      resourceId: blueprint.id,
      metadata: { key: blueprint.key },
    });
    return Response.json({ blueprint }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
