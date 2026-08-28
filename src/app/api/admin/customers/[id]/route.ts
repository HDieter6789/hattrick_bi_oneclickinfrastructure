import { requireAuth } from "@/lib/authz";
import { toErrorResponse } from "@/lib/api-response";
import { recordAdminAuditLog } from "@/features/admin-portal/audit";
import { getAdminCustomerDetail, updateAdminCustomerStatus, type UpdateCustomerStatusDraft } from "@/features/admin-portal/customers";
import { InvalidCustomerStatusTransitionError } from "@/features/admin-portal/pure/customer-status";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/admin/customers/[id] — aggregated read-only detail:
 * configurations, connections (non-secret fields only), deployments,
 * appointments, access grants, alerts. */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const customer = await getAdminCustomerDetail(id);
    if (!customer) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ customer });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PATCH /api/admin/customers/[id] — the only mutation this admin surface
 * performs on a customer: a status transition (suspend/reactivate). */
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const actor = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as UpdateCustomerStatusDraft;
    const customer = await updateAdminCustomerStatus(id, body);
    await recordAdminAuditLog({
      actor,
      action: "customer.status_change",
      resourceType: "Customer",
      resourceId: id,
      customerId: id,
      metadata: { status: customer.status },
    });
    return Response.json({ customer });
  } catch (error) {
    if (error instanceof InvalidCustomerStatusTransitionError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return toErrorResponse(error);
  }
}
