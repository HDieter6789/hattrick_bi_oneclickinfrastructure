import { NextResponse } from "next/server";
import { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/lib/authz";
import { childLogger } from "@/lib/logger";

const log = childLogger({ module: "appointments.http" });

/** Shared error → HTTP response mapping for every route handler under
 * src/app/api/appointments and src/app/api/service-agents, so authz and
 * validation failures are reported consistently. */
export function toApiErrorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
  if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid request", issues: error.issues }, { status: 400 });

  const message = error instanceof Error ? error.message : "Unexpected error";
  log.error({ err: error }, "Appointments API request failed");
  return NextResponse.json({ error: message }, { status: 400 });
}
