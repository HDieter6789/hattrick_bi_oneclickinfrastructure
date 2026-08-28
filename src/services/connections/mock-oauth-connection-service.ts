import { prisma } from "@/db/prisma";
import { getEnv } from "@/lib/env";
import { childLogger } from "@/lib/logger";
import { upsertConnectionSecret } from "./connection-secret";
import type { OAuthAuthorizationResult, OAuthCallbackResult, OAuthConnectionService } from "./oauth-connection-service";
import { signOAuthState, verifyOAuthState } from "./oauth-state";

const log = childLogger({ module: "connections.mock-oauth-connection-service" });

const MOCK_TOKEN_VALUE = "demo-oauth-access-token";
const MOCK_CODE = "demo-authorization-code";

/**
 * Demo-mode `OAuthConnectionService`: no real IdP round-trip, but the same
 * signed-state issuance/validation as the real adapter runs for real, so
 * the "Connect" flow's state handling is genuinely exercised in demo mode
 * too. `authorizationUrl` points back at this app's own OAuth callback
 * route with a pre-filled mock authorization code, simulating the IdP
 * redirect immediately.
 */
export class MockOAuthConnectionService implements OAuthConnectionService {
  async getAuthorizationUrl(connectionId: string): Promise<OAuthAuthorizationResult> {
    const env = getEnv();
    const connection = await prisma.connection.findUniqueOrThrow({ where: { id: connectionId } });
    const state = signOAuthState(env.AUTH_SECRET, connectionId);

    const url = new URL("/api/connections/oauth/callback", env.AUTH_URL ?? "http://localhost:3000");
    url.searchParams.set("code", MOCK_CODE);
    url.searchParams.set("state", state);

    await prisma.connection.update({ where: { id: connection.id }, data: { status: "authenticating" } });
    log.debug({ connectionId }, "Mock OAuth authorization URL issued");
    return { authorizationUrl: url.toString(), state };
  }

  async handleCallback(code: string, state: string): Promise<OAuthCallbackResult> {
    const env = getEnv();
    const { connectionId } = verifyOAuthState(env.AUTH_SECRET, state);
    const connection = await prisma.connection.findUniqueOrThrow({ where: { id: connectionId } });

    if (code !== MOCK_CODE) {
      // Still a meaningful check in demo mode: an unexpected code means a
      // caller (or the mock's own URL) was tampered with.
      log.warn({ connectionId }, "Mock OAuth callback received an unexpected authorization code");
    }

    await upsertConnectionSecret({
      customerId: connection.customerId,
      connectionId,
      connectionType: connection.connectorTypeKey,
      value: MOCK_TOKEN_VALUE,
    });

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const updated = await prisma.connection.update({
      where: { id: connectionId },
      data: { status: "connected", connectedAt: new Date(), expiresAt, health: "healthy", lastValidationAt: new Date() },
    });

    log.info({ connectionId }, "Mock OAuth connect flow completed");
    return { connectionId: updated.id, status: updated.status };
  }
}
