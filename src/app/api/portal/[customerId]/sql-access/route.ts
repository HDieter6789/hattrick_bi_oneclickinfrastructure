import { prisma } from "@/db/prisma";
import { requireCustomerAccess } from "@/lib/require-customer-access";
import { toErrorResponse } from "@/lib/api-response";
import { buildSqlAccessSummary } from "@/services/sql-access";

interface RouteParams {
  params: Promise<{ customerId: string }>;
}

/** GET /api/portal/[customerId]/sql-access — the customer's portal-exposed
 * SQL Analytics Endpoint(s), enriched with the customer-safe summary
 * (auth method, read-only notice, example query) from
 * services/sql-access/sql-access-summary.ts. Never returns
 * `connectionString`/`fabricWorkspaceId`/`fabricLakehouseId` — only what
 * buildSqlAccessSummary explicitly re-derives from `server`/`database`.
 * Response: `{ sqlAccess: Array<{ id: string; provisioningStatus: string; readOnly: boolean; summary: SqlAccessSummary }> }`. */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { customerId } = await params;
    await requireCustomerAccess(customerId);

    const endpoints = await prisma.sqlEndpoint.findMany({
      where: { customerId, exposedInPortal: true },
      orderBy: { updatedAt: "desc" },
    });

    const sqlAccess = endpoints.map((endpoint) => ({
      id: endpoint.id,
      provisioningStatus: endpoint.provisioningStatus,
      readOnly: endpoint.readOnly,
      summary: buildSqlAccessSummary({ server: endpoint.server, database: endpoint.database }),
    }));

    return Response.json({ sqlAccess });
  } catch (error) {
    return toErrorResponse(error);
  }
}
