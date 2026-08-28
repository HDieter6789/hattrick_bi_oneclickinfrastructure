import { prisma } from "@/db/prisma";
import { requireCustomerAccess } from "@/lib/require-customer-access";
import { toErrorResponse } from "@/lib/api-response";

interface RouteParams {
  params: Promise<{ customerId: string }>;
}

/** GET /api/portal/[customerId]/alerts — only customer-visible alerts
 * (`customerVisible: true`). Deliberately never selects/returns `context`
 * — that field may carry internal resource ids and is only ever meant for
 * the admin alerts view (owned elsewhere).
 * Response: `{ alerts: Array<{ id: string; sourceEvent: AlertSourceEvent; severity: AlertSeverity; status: AlertStatus; title: string; detail: string | null; createdAt: string; acknowledgedAt: string | null; resolvedAt: string | null }> }`. */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { customerId } = await params;
    await requireCustomerAccess(customerId);

    const alerts = await prisma.alert.findMany({
      where: { customerId, customerVisible: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sourceEvent: true,
        severity: true,
        status: true,
        title: true,
        detail: true,
        createdAt: true,
        acknowledgedAt: true,
        resolvedAt: true,
      },
    });

    return Response.json({ alerts });
  } catch (error) {
    return toErrorResponse(error);
  }
}
