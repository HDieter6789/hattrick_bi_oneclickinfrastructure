import { requireAuth } from "@/lib/authz";
import { toErrorResponse } from "@/lib/api-response";
import { recordAdminAuditLog } from "@/features/admin-portal/audit";
import {
  createAdminFabricCapability,
  listAdminFabricCapabilities,
  type ListAdminFabricCapabilitiesDraft,
  type RegisterFabricCapabilityDraft,
} from "@/features/admin-portal/fabric-capabilities";

/** GET /api/admin/fabric-capabilities?category=&enabledOnly= — admin list
 * of the Fabric Capability Registry, grouped by category in the UI. */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const query: ListAdminFabricCapabilitiesDraft = {
      category: (url.searchParams.get("category") as ListAdminFabricCapabilitiesDraft["category"]) ?? undefined,
      enabledOnly: url.searchParams.get("enabledOnly") === "true" ? true : undefined,
    };
    const capabilities = await listAdminFabricCapabilities(query);
    return Response.json({ capabilities });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/admin/fabric-capabilities — registers a new capability (or
 * re-registers/upserts an existing one by itemType), via the canonical
 * `FabricCapabilityRegistryService.registerCapability`. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireAuth();
    const body = (await request.json()) as RegisterFabricCapabilityDraft;
    const capability = await createAdminFabricCapability(body);
    await recordAdminAuditLog({
      actor,
      action: "fabric_capability.create",
      resourceType: "FabricCapability",
      resourceId: capability.id,
      metadata: { itemType: capability.itemType },
    });
    return Response.json({ capability }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
