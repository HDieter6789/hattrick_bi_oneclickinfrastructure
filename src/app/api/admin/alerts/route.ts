import { toErrorResponse } from "@/lib/api-response";
import { listAdminAlerts, type ListAdminAlertsDraft } from "@/features/admin-portal/alerts";

/** GET /api/admin/alerts?status=&severity=&customerId=&page=&pageSize= —
 * filterable admin alert list, severity-sorted by default. */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const query: ListAdminAlertsDraft = {
      status: (url.searchParams.get("status") as ListAdminAlertsDraft["status"]) ?? undefined,
      severity: (url.searchParams.get("severity") as ListAdminAlertsDraft["severity"]) ?? undefined,
      customerId: url.searchParams.get("customerId") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    };
    const result = await listAdminAlerts(query);
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
