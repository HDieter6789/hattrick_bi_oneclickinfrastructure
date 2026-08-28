import { requireAuth } from "@/lib/authz";
import { toErrorResponse } from "@/lib/api-response";
import { recordAdminAuditLog } from "@/features/admin-portal/audit";
import { getAdminAlert, updateAdminAlertStatus, type UpdateAdminAlertDraft } from "@/features/admin-portal/alerts";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/admin/alerts/[id] — one alert's full detail. */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const alert = await getAdminAlert(id);
    if (!alert) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ alert });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PATCH /api/admin/alerts/[id] — acknowledge or resolve. */
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const actor = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as UpdateAdminAlertDraft;
    const alert = await updateAdminAlertStatus(id, body);
    await recordAdminAuditLog({
      actor,
      action: `alert.${body.status}`,
      resourceType: "Alert",
      resourceId: id,
      customerId: alert.customerId,
      metadata: { severity: alert.severity, sourceEvent: alert.sourceEvent },
    });
    return Response.json({ alert });
  } catch (error) {
    return toErrorResponse(error);
  }
}
