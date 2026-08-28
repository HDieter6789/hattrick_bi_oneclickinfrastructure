import { requireAuth, ForbiddenError } from "@/lib/authz";
import { toErrorResponse } from "@/lib/api-response";
import { fabricCapabilityRegistry } from "@/services/fabric/capability-registry";

/** GET /api/fabric-capabilities?enabledOnly=&category= — the Fabric
 * Capability Registry (with parameterSchemas), the single source the
 * Dynamic Parameter Engine / Generic Form Renderer consumes. No Fabric item
 * type is ever hardcoded into a component — this route (and its consumers)
 * is how that rule is upheld on the wizard's Fabric Resources step. */
export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireAuth();
    if (ctx.role === "customer_user") {
      throw new ForbiddenError("The Fabric capability registry is not accessible to this role");
    }

    const url = new URL(request.url);
    const enabledOnly = url.searchParams.get("enabledOnly") !== "false";
    const category = url.searchParams.get("category") ?? undefined;

    const capabilities = await fabricCapabilityRegistry.getCapabilities({ enabledOnly, category });
    return Response.json({ capabilities });
  } catch (error) {
    return toErrorResponse(error);
  }
}
