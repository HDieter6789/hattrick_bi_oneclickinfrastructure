import { prisma } from "@/db/prisma";
import { requireCustomerAccess } from "@/lib/require-customer-access";
import { toErrorResponse } from "@/lib/api-response";
import { getOAuthConnectionService } from "@/services/connections";

interface RouteParams {
  params: Promise<{ connectionId: string }>;
}

/** POST /api/connections/{connectionId}/oauth/authorize — starts the
 * OAuth2 "Connect" flow, returning the URL the browser should be
 * redirected to. */
export async function POST(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { connectionId } = await params;
    const connection = await prisma.connection.findUniqueOrThrow({ where: { id: connectionId } });
    await requireCustomerAccess(connection.customerId);

    const result = await getOAuthConnectionService().getAuthorizationUrl(connectionId);
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
