import { prisma } from "@/db/prisma";
import { requireAuth, ForbiddenError } from "@/lib/authz";
import { toErrorResponse } from "@/lib/api-response";

/** GET /api/blueprints — the Blueprint catalog (with resources) for the
 * wizard's Architecture step. Not sensitive: internal roles and
 * customer_admin can both read it (customer_admin so a customer-facing
 * "what would this look like" preview is possible later); customer_user is
 * excluded since blueprints are a provisioning concern, not something an
 * ordinary portal user needs. */
export async function GET(): Promise<Response> {
  try {
    const ctx = await requireAuth();
    if (ctx.role === "customer_user") {
      throw new ForbiddenError("Blueprints are not accessible to this role");
    }

    const blueprints = await prisma.blueprint.findMany({
      include: { resources: { orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" },
    });
    return Response.json({ blueprints });
  } catch (error) {
    return toErrorResponse(error);
  }
}
