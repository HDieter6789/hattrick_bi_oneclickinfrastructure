import { prisma } from "@/db/prisma";
import { requireCustomerAccess } from "@/lib/require-customer-access";
import { toErrorResponse } from "@/lib/api-response";
import { childLogger } from "@/lib/logger";
import { deleteConnectionSecrets, fabricConnectionService } from "@/services/connections";

const log = childLogger({ module: "api.connections.detail" });

interface RouteParams {
  params: Promise<{ connectionId: string }>;
}

/** GET /api/connections/{connectionId} — connection health/status. */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { connectionId } = await params;
    const connection = await prisma.connection.findUniqueOrThrow({
      where: { id: connectionId },
      include: { connector: { select: { displayName: true, category: true, iconKey: true } } },
    });
    await requireCustomerAccess(connection.customerId);
    return Response.json({ connection });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/connections/{connectionId} — removes the Fabric-side
 * connection (best-effort), all stored secrets, and the local record. */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<Response> {
  try {
    const { connectionId } = await params;
    const connection = await prisma.connection.findUniqueOrThrow({ where: { id: connectionId } });
    await requireCustomerAccess(connection.customerId);

    try {
      await fabricConnectionService.deleteFabricConnection(connectionId);
    } catch (error) {
      // Best-effort: still remove the local record and secrets so the
      // customer isn't stuck with an undeletable connection because the
      // Fabric-side item was already gone or Fabric is unreachable.
      log.warn({ connectionId, error: error instanceof Error ? error.message : String(error) }, "Failed to delete Fabric-side connection — continuing with local cleanup");
    }

    await deleteConnectionSecrets(connectionId);
    await prisma.connection.delete({ where: { id: connectionId } });

    log.info({ connectionId }, "Connection deleted");
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
