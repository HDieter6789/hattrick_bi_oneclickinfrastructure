import { ZodError } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/authz";
import { childLogger } from "@/lib/logger";

const log = childLogger({ module: "api" });

/**
 * Maps a thrown error from a route handler to an HTTP response. Centralized
 * so `requireAuth`/`requireRole`/`requireCustomerAccess` failures and Zod
 * validation failures are handled identically everywhere instead of each
 * route handler re-implementing its own try/catch mapping.
 */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof ZodError) {
    return Response.json({ error: "Invalid request", issues: error.issues }, { status: 400 });
  }
  if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2025") {
    // Prisma "record not found" (findUniqueOrThrow / update / delete).
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  log.error({ error: error instanceof Error ? { name: error.name, message: error.message } : String(error) }, "Unhandled API error");
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
