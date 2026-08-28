import { prisma } from "@/db/prisma";
import { getEnv } from "@/lib/env";
import { requireAuth } from "@/lib/authz";
import { requireCustomerAccess } from "@/lib/require-customer-access";
import { toErrorResponse } from "@/lib/api-response";
import { childLogger } from "@/lib/logger";
import { oauthCallbackInput } from "@/schemas/connection";
import { getOAuthConnectionService } from "@/services/connections";
import { verifyOAuthState } from "@/services/connections/oauth-state";

const log = childLogger({ module: "api.connections.oauth-callback" });

/**
 * GET /api/connections/oauth/callback?code=...&state=... — the redirect
 * target the IdP sends the browser back to. Access is checked TWICE: the
 * state signature/expiry alone proves the callback wasn't forged or
 * replayed, but not that *this* signed-in user may act on the connection
 * it names — so the customer that owns the connection is resolved and
 * `requireCustomerAccess` is checked before `handleCallback` does any
 * token exchange or mutation, not after.
 *
 * There is no wizard route owned by this service to redirect back into —
 * the provisioning wizard's Data Sources step (built separately) should
 * read `?connection=...&status=...` off this redirect.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const url = new URL(request.url);
    const input = oauthCallbackInput.parse({
      code: url.searchParams.get("code") ?? undefined,
      state: url.searchParams.get("state") ?? undefined,
    });

    const env = getEnv();
    const { connectionId } = verifyOAuthState(env.AUTH_SECRET, input.state);
    const connection = await prisma.connection.findUniqueOrThrow({ where: { id: connectionId } });
    await requireCustomerAccess(connection.customerId);

    const result = await getOAuthConnectionService().handleCallback(input.code, input.state);

    const redirectUrl = new URL("/", env.AUTH_URL ?? request.url);
    redirectUrl.searchParams.set("connection", result.connectionId);
    redirectUrl.searchParams.set("status", result.status);
    return Response.redirect(redirectUrl, 303);
  } catch (error) {
    log.warn({ error: error instanceof Error ? error.message : String(error) }, "OAuth callback failed");
    return toErrorResponse(error);
  }
}
