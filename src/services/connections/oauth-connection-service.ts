import { prisma } from "@/db/prisma";
import { getEnv } from "@/lib/env";
import { childLogger } from "@/lib/logger";
import type { ConnectionStatus } from "@/generated/prisma/enums";
import { upsertConnectionSecret } from "./connection-secret";
import { signOAuthState, verifyOAuthState } from "./oauth-state";

const log = childLogger({ module: "connections.oauth-connection-service" });

export interface OAuthAuthorizationResult {
  authorizationUrl: string;
  state: string;
}

export interface OAuthCallbackResult {
  connectionId: string;
  status: ConnectionStatus;
}

/**
 * Abstraction for the OAuth2 "Connect" flow (brief section 15). Mirrors the
 * `FabricApiClient`/`SecretProvider` interface + real/mock adapter pattern
 * — see services/connections/index.ts for the DEMO_MODE switch and
 * services/connections/mock-oauth-connection-service.ts for the demo
 * adapter.
 *
 * Only `expiresAt` (a timestamp) is ever persisted about the resulting
 * token — the token value itself only ever exists as an in-flight local
 * variable and the opaque `SecretProvider` reference.
 */
export interface OAuthConnectionService {
  getAuthorizationUrl(connectionId: string): Promise<OAuthAuthorizationResult>;
  handleCallback(code: string, state: string): Promise<OAuthCallbackResult>;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

/**
 * Real implementation: a standard RFC 6749 Authorization Code flow against
 * a generic OAuth2 IdP, configured via `CONNECTION_OAUTH_*` env vars (see
 * src/lib/env.ts). In production, different connector types typically need
 * their own IdP app registration (a Salesforce connected app, a Dynamics
 * app registration, ...); this single-provider configuration is the
 * baseline the brief asks for and is the natural place to extend into a
 * per-connector-type provider map later without changing this interface.
 */
export class RealOAuthConnectionService implements OAuthConnectionService {
  async getAuthorizationUrl(connectionId: string): Promise<OAuthAuthorizationResult> {
    const env = getEnv();
    if (!env.CONNECTION_OAUTH_CLIENT_ID || !env.CONNECTION_OAUTH_AUTHORIZATION_ENDPOINT || !env.CONNECTION_OAUTH_REDIRECT_URI) {
      throw new Error(
        "OAuth2 connector authorization is not configured (CONNECTION_OAUTH_CLIENT_ID / CONNECTION_OAUTH_AUTHORIZATION_ENDPOINT / CONNECTION_OAUTH_REDIRECT_URI)",
      );
    }

    const connection = await prisma.connection.findUniqueOrThrow({ where: { id: connectionId } });
    const state = signOAuthState(env.AUTH_SECRET, connectionId);

    const url = new URL(env.CONNECTION_OAUTH_AUTHORIZATION_ENDPOINT);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", env.CONNECTION_OAUTH_CLIENT_ID);
    url.searchParams.set("redirect_uri", env.CONNECTION_OAUTH_REDIRECT_URI);
    url.searchParams.set("scope", env.CONNECTION_OAUTH_SCOPE);
    url.searchParams.set("state", state);

    await prisma.connection.update({ where: { id: connection.id }, data: { status: "authenticating" } });
    log.info({ connectionId }, "OAuth authorization URL issued");
    return { authorizationUrl: url.toString(), state };
  }

  async handleCallback(code: string, state: string): Promise<OAuthCallbackResult> {
    const env = getEnv();
    if (!env.CONNECTION_OAUTH_CLIENT_ID || !env.CONNECTION_OAUTH_CLIENT_SECRET || !env.CONNECTION_OAUTH_TOKEN_ENDPOINT || !env.CONNECTION_OAUTH_REDIRECT_URI) {
      throw new Error(
        "OAuth2 connector token exchange is not configured (CONNECTION_OAUTH_CLIENT_ID / CONNECTION_OAUTH_CLIENT_SECRET / CONNECTION_OAUTH_TOKEN_ENDPOINT / CONNECTION_OAUTH_REDIRECT_URI)",
      );
    }

    const { connectionId } = verifyOAuthState(env.AUTH_SECRET, state);
    const connection = await prisma.connection.findUniqueOrThrow({ where: { id: connectionId } });

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env.CONNECTION_OAUTH_REDIRECT_URI,
      client_id: env.CONNECTION_OAUTH_CLIENT_ID,
      client_secret: env.CONNECTION_OAUTH_CLIENT_SECRET,
    });

    const response = await fetch(env.CONNECTION_OAUTH_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      // Never log the response body here — token error responses can echo
      // request parameters and, in non-compliant IdP implementations,
      // partial credential data. Status is enough to diagnose from.
      await prisma.connection.update({ where: { id: connectionId }, data: { status: "error", health: "failed" } });
      log.error({ connectionId, status: response.status }, "OAuth token exchange failed");
      throw new Error(`OAuth token exchange failed (HTTP ${response.status})`);
    }

    const token = (await response.json()) as TokenResponse;
    const tokenValue = token.refresh_token ?? token.access_token;
    if (!tokenValue) {
      throw new Error("OAuth token response did not include an access or refresh token");
    }

    await upsertConnectionSecret({
      customerId: connection.customerId,
      connectionId,
      connectionType: connection.connectorTypeKey,
      value: tokenValue,
    });

    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null;
    const updated = await prisma.connection.update({
      where: { id: connectionId },
      data: { status: "connected", connectedAt: new Date(), expiresAt, health: "healthy", lastValidationAt: new Date() },
    });

    log.info({ connectionId }, "OAuth connect flow completed");
    return { connectionId: updated.id, status: updated.status };
  }
}
