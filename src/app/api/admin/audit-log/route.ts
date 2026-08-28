import { toErrorResponse } from "@/lib/api-response";
import { listAdminAuditLog, type ListAdminAuditLogDraft } from "@/features/admin-portal/audit-log";

/** GET /api/admin/audit-log — paginated, filterable read of AuditLog rows
 * (append-only; there is no write route here, see audit-log.ts's module doc). */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const query: ListAdminAuditLogDraft = {
      userId: url.searchParams.get("userId") ?? undefined,
      customerId: url.searchParams.get("customerId") ?? undefined,
      deploymentId: url.searchParams.get("deploymentId") ?? undefined,
      action: url.searchParams.get("action") ?? undefined,
      status: (url.searchParams.get("status") as ListAdminAuditLogDraft["status"]) ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    };
    const result = await listAdminAuditLog(query);
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
