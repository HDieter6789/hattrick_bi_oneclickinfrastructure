import { toErrorResponse } from "@/lib/api-response";
import { listAdminCustomers, type ListAdminCustomersDraft } from "@/features/admin-portal/customers";

/** GET /api/admin/customers?status=&search=&page=&pageSize= — read-only
 * admin overview list. Read directly via Prisma (features/admin-portal/customers.ts),
 * never through Agent D's /api/customers. */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const query: ListAdminCustomersDraft = {
      status: (url.searchParams.get("status") as ListAdminCustomersDraft["status"]) ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    };
    const result = await listAdminCustomers(query);
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
