import { childLogger } from "@/lib/logger";

const log = childLogger({ module: "entra.token-provider" });

export interface AccessTokenProvider {
  getToken(): Promise<string>;
}

interface CachedToken {
  value: string;
  expiresAtMs: number;
}

/**
 * Generic Microsoft Entra ID app-only (service principal / client
 * credentials) token acquisition. This is deliberately resource-agnostic —
 * the `scope` is injected by the caller — so both the Fabric API client
 * (services/fabric/token-provider.ts) and the Microsoft Graph client
 * (services/graph/token-provider.ts) share exactly one implementation of
 * the OAuth2 client-credentials HTTP flow instead of duplicating it. Fabric
 * and Graph are still never mixed at the *client* level — only this
 * low-level OAuth mechanics class is shared, matching how a single Entra
 * app registration is commonly granted permissions to both resources.
 *
 * The token value itself is NEVER logged or persisted — only cached
 * in-memory for its lifetime, and only the expiry timestamp is ever
 * inspected/logged.
 */
export class ServicePrincipalTokenProvider implements AccessTokenProvider {
  private cached: CachedToken | null = null;

  constructor(
    private readonly scope: string,
    private readonly tenantId: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAtMs - 60_000 > now) {
      return this.cached.value;
    }

    const url = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: this.scope,
      grant_type: "client_credentials",
    });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      // Response body from Entra can include error descriptions but never
      // the secret we sent - safe to log status only, not the body, to be
      // conservative.
      log.error({ status: response.status, scope: this.scope }, "Failed to acquire Entra access token");
      throw new Error(`Failed to acquire access token (HTTP ${response.status})`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.cached = { value: data.access_token, expiresAtMs: now + data.expires_in * 1000 };
    log.debug({ scope: this.scope, expiresInSeconds: data.expires_in }, "Acquired new access token");
    return this.cached.value;
  }
}
